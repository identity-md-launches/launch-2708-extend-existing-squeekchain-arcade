// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

/// @title Squeekchain Arcade: Number Slide sessions
/// @notice A player starts a session for a level; the contract scrambles a solvable board for it.
///         The player plays in the browser and submits every tap in one transaction; the contract
///         replays the taps and records a result only when they legally solve that session's
///         board within the level's move limit and time window. Points only: no token, no fee,
///         no value is accepted or paid out, and the contract has no owner.
contract NumberSlideSessions {
    /// @notice The only network this contract runs on: Ethereum Sepolia.
    uint256 public constant CHAIN_ID = 11155111;
    uint8 public constant LEVEL_COUNT = 6;
    /// @notice Hard cap on submitted taps, whatever the level; longer sequences are rejected before replay.
    uint256 public constant MAX_TAPS = 255;
    /// @notice Seconds after a level's time limit in which a submission may still land, for wallet
    ///         confirmation and block inclusion. The time bonus still counts every second.
    uint256 public constant SUBMIT_GRACE = 300;

    enum Status {
        None,
        Active,
        Completed
    }

    struct Session {
        address player;
        uint8 level;
        Status status;
        uint40 startedAt;
        /// @dev Cell i in bits [5i, 5i + 5); 0 is the empty cell.
        uint256 board;
    }

    struct Result {
        uint256 sessionId;
        address player;
        uint8 level;
        uint16 moves;
        uint32 elapsed;
        uint32 score;
        uint40 completedAt;
    }

    uint256 public sessionCount;
    mapping(uint256 => Session) private _sessions;
    mapping(address => uint256) public latestSessionOf;
    Result[] private _results;

    event SessionStarted(
        uint256 indexed sessionId, address indexed player, uint8 indexed level, uint256 board, uint40 startedAt
    );
    event SessionCompleted(
        uint256 indexed sessionId,
        address indexed player,
        uint8 indexed level,
        uint16 moves,
        uint32 elapsed,
        uint32 score
    );

    error WrongNetwork(uint256 chainId);
    error UnknownLevel(uint8 level);
    error UnknownSession(uint256 sessionId);
    error NotSessionPlayer(uint256 sessionId, address caller);
    error AlreadySubmitted(uint256 sessionId);
    error SessionExpired(uint256 sessionId);
    error EmptyMoves();
    error TooManyTaps(uint256 length);
    error IllegalMove(uint256 index, uint8 cell);
    error MoveLimitExceeded(uint256 moves, uint256 limit);
    error NotSolved();

    constructor() {
        if (block.chainid != CHAIN_ID) revert WrongNetwork(block.chainid);
    }

    modifier onSepolia() {
        if (block.chainid != CHAIN_ID) revert WrongNetwork(block.chainid);
        _;
    }

    /// @notice Board size, scramble length, move limit, time limit (seconds) and base points per level.
    function levelInfo(uint8 level)
        public
        pure
        returns (uint8 size, uint8 shuffles, uint16 moveLimit, uint32 timeLimit, uint32 base)
    {
        if (level == 1) return (3, 12, 60, 120, 100);
        if (level == 2) return (3, 20, 80, 150, 200);
        if (level == 3) return (3, 32, 124, 190, 300);
        if (level == 4) return (4, 24, 130, 240, 450);
        if (level == 5) return (4, 36, 170, 300, 650);
        if (level == 6) return (5, 40, 220, 420, 900);
        revert UnknownLevel(level);
    }

    /// @notice Start a session for `level`. The caller is the only address that can submit it.
    function startSession(uint8 level) external onSepolia returns (uint256 sessionId) {
        (uint8 size, uint8 shuffles,,,) = levelInfo(level);
        sessionId = ++sessionCount;
        bytes32 seed =
            keccak256(abi.encode(block.prevrandao, blockhash(block.number - 1), msg.sender, sessionId, address(this)));
        (uint256 board,) = _scramble(seed, size, shuffles);
        uint40 now_ = uint40(block.timestamp);
        _sessions[sessionId] =
            Session({player: msg.sender, level: level, status: Status.Active, startedAt: now_, board: board});
        latestSessionOf[msg.sender] = sessionId;
        emit SessionStarted(sessionId, msg.sender, level, board, now_);
    }

    /// @notice Submit every tapped cell index, in order, as one byte each. Tapping a cell in the
    ///         empty cell's row or column slides every tile between them; each tile counts one move.
    function submitSolution(uint256 sessionId, bytes calldata taps) external onSepolia returns (uint32 score) {
        Session storage s = _sessions[sessionId];
        if (s.status == Status.None) revert UnknownSession(sessionId);
        if (s.status == Status.Completed) revert AlreadySubmitted(sessionId);
        if (s.player != msg.sender) revert NotSessionPlayer(sessionId, msg.sender);
        if (taps.length == 0) revert EmptyMoves();
        if (taps.length > MAX_TAPS) revert TooManyTaps(taps.length);

        (uint8 size,, uint16 moveLimit, uint32 timeLimit, uint32 base) = levelInfo(s.level);
        uint256 elapsed = block.timestamp - s.startedAt;
        if (elapsed > uint256(timeLimit) + SUBMIT_GRACE) revert SessionExpired(sessionId);

        uint256 moves = _replay(s.board, size, moveLimit, taps);

        s.status = Status.Completed;
        uint256 timeLeft = elapsed >= timeLimit ? 0 : timeLimit - elapsed;
        score = uint32(base + (500 * (moveLimit - moves)) / moveLimit + (500 * timeLeft) / timeLimit);
        _results.push(
            Result({
                sessionId: sessionId,
                player: msg.sender,
                level: s.level,
                moves: uint16(moves),
                elapsed: uint32(elapsed),
                score: score,
                completedAt: uint40(block.timestamp)
            })
        );
        emit SessionCompleted(sessionId, msg.sender, s.level, uint16(moves), uint32(elapsed), score);
    }

    function getSession(uint256 sessionId) external view returns (Session memory) {
        return _sessions[sessionId];
    }

    function resultCount() external view returns (uint256) {
        return _results.length;
    }

    /// @notice Verified results from `start`, at most `count` of them.
    function getResults(uint256 start, uint256 count) external view returns (Result[] memory out) {
        uint256 len = _results.length;
        if (start >= len) return new Result[](0);
        uint256 end = len - start < count ? len : start + count;
        out = new Result[](end - start);
        for (uint256 i = start; i < end; i++) {
            out[i - start] = _results[i];
        }
    }

    /// @dev Replays `taps` on `board` and returns the moves used; reverts unless the result is solved.
    function _replay(uint256 board, uint8 size, uint16 moveLimit, bytes calldata taps)
        internal
        pure
        returns (uint256 moves)
    {
        uint256 cells = uint256(size) * size;
        uint8[] memory b = new uint8[](cells);
        uint256 empty;
        for (uint256 i = 0; i < cells; i++) {
            b[i] = uint8((board >> (5 * i)) & 31);
            if (b[i] == 0) empty = i;
        }
        for (uint256 t = 0; t < taps.length; t++) {
            uint256 target = uint8(taps[t]);
            if (target >= cells || target == empty) revert IllegalMove(t, uint8(target));
            bool sameRow = target / size == empty / size;
            if (!sameRow && target % size != empty % size) revert IllegalMove(t, uint8(target));
            uint256 step = sameRow ? 1 : size;
            if (target > empty) {
                while (empty != target) {
                    b[empty] = b[empty + step];
                    empty += step;
                    moves++;
                }
            } else {
                while (empty != target) {
                    b[empty] = b[empty - step];
                    empty -= step;
                    moves++;
                }
            }
            b[empty] = 0;
            if (moves > moveLimit) revert MoveLimitExceeded(moves, moveLimit);
        }
        for (uint256 i = 0; i + 1 < cells; i++) {
            if (b[i] != i + 1) revert NotSolved();
        }
    }

    /// @dev Walks the empty cell `shuffles` steps from the solved board, never straight back, so
    ///      the board is solvable in at most `shuffles` moves. Returns the packed board and the
    ///      empty cell's path (path[0] is the bottom-right corner). A walk that lands on the solved
    ///      board is redone from the next seed.
    function _scramble(bytes32 seed, uint8 size, uint8 shuffles)
        internal
        pure
        returns (uint256 board, uint8[] memory path)
    {
        uint256 cells = uint256(size) * size;
        for (uint256 attempt = 0;; attempt++) {
            uint8[] memory b = new uint8[](cells);
            for (uint256 i = 0; i + 1 < cells; i++) {
                b[i] = uint8(i + 1);
            }
            path = new uint8[](uint256(shuffles) + 1);
            uint256 empty = cells - 1;
            uint256 prev = type(uint256).max;
            path[0] = uint8(empty);
            bytes32 s = keccak256(abi.encode(seed, attempt));
            for (uint256 n = 0; n < shuffles; n++) {
                uint256[4] memory opts;
                uint256 k;
                uint256 r = empty / size;
                uint256 c = empty % size;
                if (r > 0 && empty - size != prev) opts[k++] = empty - size;
                if (r + 1 < size && empty + size != prev) opts[k++] = empty + size;
                if (c > 0 && empty - 1 != prev) opts[k++] = empty - 1;
                if (c + 1 < size && empty + 1 != prev) opts[k++] = empty + 1;
                uint256 next = opts[uint256(keccak256(abi.encode(s, n))) % k];
                b[empty] = b[next];
                b[next] = 0;
                prev = empty;
                empty = next;
                path[n + 1] = uint8(next);
            }
            bool solved = empty == cells - 1;
            for (uint256 i = 0; solved && i + 1 < cells; i++) {
                if (b[i] != i + 1) solved = false;
            }
            if (!solved) {
                for (uint256 i = 0; i < cells; i++) {
                    board |= uint256(b[i]) << (5 * i);
                }
                return (board, path);
            }
        }
    }
}
