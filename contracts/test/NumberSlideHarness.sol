// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {NumberSlideSessions} from "../src/NumberSlideSessions.sol";

/// @notice Test helper: exposes the scramble walk so tests can build the reverse-path solution.
contract NumberSlideHarness is NumberSlideSessions {
    function scramble(bytes32 seed, uint8 level) external pure returns (uint256 board, uint8[] memory path) {
        (uint8 size, uint8 shuffles,,,) = levelInfo(level);
        return _scramble(seed, size, shuffles);
    }

    /// @notice Session seed as startSession derives it, for a call made in the current block.
    function seedFor(address player, uint256 sessionId) external view returns (bytes32) {
        return keccak256(abi.encode(block.prevrandao, blockhash(block.number - 1), player, sessionId, address(this)));
    }
}

interface Vm {
    function prank(address) external;
    function chainId(uint256) external;
    function warp(uint256) external;
    function roll(uint256) external;
    function expectRevert(bytes calldata) external;
    function expectRevert(bytes4) external;
    function expectEmit(bool, bool, bool, bool) external;
}
