// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {NumberSlideSessions} from "../src/NumberSlideSessions.sol";
import {NumberSlideHarness, Vm} from "./NumberSlideHarness.sol";

contract NumberSlideSessionsTest {
    Vm constant vm = Vm(address(uint160(uint256(keccak256("hevm cheat code")))));
    address constant ALICE = address(0xA11CE);
    address constant BOB = address(0xB0B);

    NumberSlideHarness game;

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

    function setUp() public {
        vm.chainId(11155111);
        vm.roll(100);
        vm.warp(1_700_000_000);
        game = new NumberSlideHarness();
    }

    // ---- helpers ----

    function _start(address player, uint8 level) internal returns (uint256 id, bytes memory solution) {
        bytes32 seed = game.seedFor(player, game.sessionCount() + 1);
        (uint256 board, uint8[] memory path) = game.scramble(seed, level);
        vm.prank(player);
        id = game.startSession(level);
        require(game.getSession(id).board == board, "board matches walk");
        // Undo the walk: tap the empty cell's earlier positions in reverse.
        solution = new bytes(path.length - 1);
        for (uint256 i = 0; i + 1 < path.length; i++) {
            solution[i] = bytes1(path[path.length - 2 - i]);
        }
    }

    function _eq(uint256 a, uint256 b, string memory m) internal pure {
        require(a == b, m);
    }

    // ---- successful completion ----

    function testEveryLevelSolvesWithinLimits() public {
        for (uint8 level = 1; level <= 6; level++) {
            (uint256 id, bytes memory solution) = _start(ALICE, level);
            (,, uint16 moveLimit, uint32 timeLimit,) = game.levelInfo(level);
            require(solution.length <= moveLimit, "reverse walk within move limit");
            vm.warp(block.timestamp + timeLimit - 1);
            vm.prank(ALICE);
            game.submitSolution(id, solution);
            _eq(uint8(game.getSession(id).status), uint8(NumberSlideSessions.Status.Completed), "completed");
        }
        _eq(game.resultCount(), 6, "six results");
    }

    function testSuccessfulCompletionRecordsScoreAndEmits() public {
        (uint256 id, bytes memory solution) = _start(ALICE, 1);
        vm.warp(block.timestamp + 30);
        // base 100 + floor(500 * (60 - 12) / 60) + floor(500 * (120 - 30) / 120) = 100 + 400 + 375
        vm.expectEmit(true, true, true, true);
        emit SessionCompleted(id, ALICE, 1, 12, 30, 875);
        vm.prank(ALICE);
        uint32 score = game.submitSolution(id, solution);
        _eq(score, 875, "score");
        NumberSlideSessions.Result[] memory r = game.getResults(0, 10);
        _eq(r.length, 1, "one result");
        require(r[0].player == ALICE && r[0].level == 1 && r[0].moves == 12 && r[0].elapsed == 30, "result fields");
        _eq(game.latestSessionOf(ALICE), id, "latest session");
    }

    function testStartEmitsSessionStarted() public {
        bytes32 seed = game.seedFor(ALICE, 1);
        (uint256 board,) = game.scramble(seed, 2);
        vm.expectEmit(true, true, true, true);
        emit SessionStarted(1, ALICE, 2, board, uint40(block.timestamp));
        vm.prank(ALICE);
        game.startSession(2);
    }

    function testSessionsAreUniqueAndBoardsNeverSolved() public {
        for (uint256 i = 0; i < 40; i++) {
            vm.roll(block.number + 1);
            vm.prank(ALICE);
            uint256 id = game.startSession(uint8(1 + (i % 6)));
            _eq(id, i + 1, "sequential id");
            (uint8 size,,,,) = game.levelInfo(uint8(1 + (i % 6)));
            uint256 board = game.getSession(id).board;
            bool solved = true;
            for (uint256 c = 0; c + 1 < uint256(size) * size; c++) {
                if ((board >> (5 * c)) & 31 != c + 1) solved = false;
            }
            require(!solved, "never starts solved");
        }
    }

    // ---- rejections ----

    function testUnknownLevelReverts() public {
        vm.prank(ALICE);
        vm.expectRevert(abi.encodeWithSelector(NumberSlideSessions.UnknownLevel.selector, uint8(0)));
        game.startSession(0);
        vm.prank(ALICE);
        vm.expectRevert(abi.encodeWithSelector(NumberSlideSessions.UnknownLevel.selector, uint8(7)));
        game.startSession(7);
    }

    function testInvalidMoveReverts() public {
        (uint256 id, bytes memory solution) = _start(ALICE, 1);
        // A diagonal or non-line cell from the empty cell's position is illegal.
        uint256 empty;
        uint256 board = game.getSession(id).board;
        for (uint256 c = 0; c < 9; c++) {
            if ((board >> (5 * c)) & 31 == 0) empty = c;
        }
        uint8 bad = uint8(((empty / 3 + 1) % 3) * 3 + (empty % 3 + 1) % 3); // other row and other column
        bytes memory taps = abi.encodePacked(bad, solution);
        vm.prank(ALICE);
        vm.expectRevert(abi.encodeWithSelector(NumberSlideSessions.IllegalMove.selector, uint256(0), bad));
        game.submitSolution(id, taps);
        // Tapping the empty cell, or a cell off the board, is illegal too.
        vm.prank(ALICE);
        vm.expectRevert(abi.encodeWithSelector(NumberSlideSessions.IllegalMove.selector, uint256(0), uint8(empty)));
        game.submitSolution(id, abi.encodePacked(uint8(empty)));
        vm.prank(ALICE);
        vm.expectRevert(abi.encodeWithSelector(NumberSlideSessions.IllegalMove.selector, uint256(0), uint8(9)));
        game.submitSolution(id, hex"09");
    }

    function testUnsolvedBoardReverts() public {
        (uint256 id, bytes memory solution) = _start(ALICE, 2);
        bytes memory partial_ = new bytes(solution.length - 1);
        for (uint256 i = 0; i < partial_.length; i++) {
            partial_[i] = solution[i];
        }
        vm.prank(ALICE);
        vm.expectRevert(NumberSlideSessions.NotSolved.selector);
        game.submitSolution(id, partial_);
        // The session stays open: the real solution still lands.
        vm.prank(ALICE);
        game.submitSolution(id, solution);
    }

    function testExceededMoveLimitReverts() public {
        (uint256 id, bytes memory solution) = _start(ALICE, 1);
        // Shuttle one tile back and forth until the limit of 60 is passed, then solve.
        uint256 board = game.getSession(id).board;
        uint256 empty;
        for (uint256 c = 0; c < 9; c++) {
            if ((board >> (5 * c)) & 31 == 0) empty = c;
        }
        uint8 other = uint8(empty % 3 == 0 ? empty + 1 : empty - 1);
        bytes memory taps = new bytes(62 + solution.length);
        for (uint256 i = 0; i < 62; i++) {
            taps[i] = bytes1(i % 2 == 0 ? other : uint8(empty));
        }
        for (uint256 i = 0; i < solution.length; i++) {
            taps[62 + i] = solution[i];
        }
        vm.prank(ALICE);
        vm.expectRevert(
            abi.encodeWithSelector(NumberSlideSessions.MoveLimitExceeded.selector, uint256(61), uint256(60))
        );
        game.submitSolution(id, taps);
    }

    function testOversizedAndEmptySequencesRevert() public {
        (uint256 id,) = _start(ALICE, 6);
        vm.prank(ALICE);
        vm.expectRevert(abi.encodeWithSelector(NumberSlideSessions.TooManyTaps.selector, uint256(256)));
        game.submitSolution(id, new bytes(256));
        vm.prank(ALICE);
        vm.expectRevert(NumberSlideSessions.EmptyMoves.selector);
        game.submitSolution(id, "");
    }

    function testWrongWalletReverts() public {
        (uint256 id, bytes memory solution) = _start(ALICE, 1);
        vm.prank(BOB);
        vm.expectRevert(abi.encodeWithSelector(NumberSlideSessions.NotSessionPlayer.selector, id, BOB));
        game.submitSolution(id, solution);
        vm.prank(ALICE);
        game.submitSolution(id, solution);
    }

    function testDuplicateSubmissionReverts() public {
        (uint256 id, bytes memory solution) = _start(ALICE, 1);
        vm.prank(ALICE);
        game.submitSolution(id, solution);
        vm.prank(ALICE);
        vm.expectRevert(abi.encodeWithSelector(NumberSlideSessions.AlreadySubmitted.selector, id));
        game.submitSolution(id, solution);
        _eq(game.resultCount(), 1, "one result only");
    }

    function testUnknownSessionReverts() public {
        vm.prank(ALICE);
        vm.expectRevert(abi.encodeWithSelector(NumberSlideSessions.UnknownSession.selector, uint256(42)));
        game.submitSolution(42, hex"07");
    }

    function testExpiredSessionReverts() public {
        (uint256 id, bytes memory solution) = _start(ALICE, 1);
        vm.warp(block.timestamp + 120 + 300 + 1);
        vm.prank(ALICE);
        vm.expectRevert(abi.encodeWithSelector(NumberSlideSessions.SessionExpired.selector, id));
        game.submitSolution(id, solution);
    }

    function testLateButInGraceScoresNoTimeBonus() public {
        (uint256 id, bytes memory solution) = _start(ALICE, 1);
        vm.warp(block.timestamp + 200);
        vm.prank(ALICE);
        uint32 score = game.submitSolution(id, solution);
        _eq(score, 100 + 400, "no time bonus after the limit");
    }

    function testWrongNetworkReverts() public {
        (uint256 id, bytes memory solution) = _start(ALICE, 1);
        vm.chainId(1);
        vm.prank(ALICE);
        vm.expectRevert(abi.encodeWithSelector(NumberSlideSessions.WrongNetwork.selector, uint256(1)));
        game.startSession(1);
        vm.prank(ALICE);
        vm.expectRevert(abi.encodeWithSelector(NumberSlideSessions.WrongNetwork.selector, uint256(1)));
        game.submitSolution(id, solution);
        vm.expectRevert(abi.encodeWithSelector(NumberSlideSessions.WrongNetwork.selector, uint256(1)));
        new NumberSlideSessions();
    }

    function testGetResultsPaginates() public {
        for (uint256 i = 0; i < 3; i++) {
            vm.roll(block.number + 1);
            (uint256 id, bytes memory solution) = _start(ALICE, 1);
            vm.prank(ALICE);
            game.submitSolution(id, solution);
        }
        _eq(game.getResults(1, 10).length, 2, "from 1");
        _eq(game.getResults(0, 2).length, 2, "count 2");
        _eq(game.getResults(5, 2).length, 0, "past end");
        _eq(game.getResults(0, type(uint256).max).length, 3, "huge count is safe");
    }

    /// The browser engine (src/games/number-slide/engine.ts) computes these boards for seed 0xab;
    /// the contract must produce the same ones.
    function testScrambleMatchesBrowserEngine() public view {
        bytes32 seed = bytes32(uint256(0xab));
        uint256[6] memory expected = [
            uint256(0x21d0609462),
            0x31c81120a3,
            0x638820410a3,
            0x5b0aa438ed025e620c41,
            0x5940a43ced231c61a441,
            0x14c42c07b6f55c66813152718e549061
        ];
        for (uint8 level = 1; level <= 6; level++) {
            (uint256 board,) = game.scramble(seed, level);
            _eq(board, expected[level - 1], "board parity with engine.ts");
        }
    }

    /// Fuzz: random tap bytes never record a result unless they really solve the board.
    function testFuzzRandomTapsNeverFalselyAccepted(bytes calldata taps) public {
        (uint256 id,) = _start(ALICE, 3);
        vm.prank(ALICE);
        try game.submitSolution(id, taps) {
            _eq(game.resultCount(), 1, "accepted runs are recorded");
        } catch {
            _eq(game.resultCount(), 0, "rejected runs record nothing");
        }
    }
}
