// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {NumberSlideSessions} from "../src/NumberSlideSessions.sol";

interface VmBroadcast {
    function startBroadcast() external;
    function stopBroadcast() external;
}

/// @notice Deploys through the deterministic CREATE2 deployer (0x4e59b448...4956C) with salt 0, so the
///         address is the one the site already points at (src/chain/contract.generated.ts).
///         forge script script/Deploy.s.sol --rpc-url https://ethereum-sepolia-rpc.publicnode.com --broadcast --account <your keystore>
contract Deploy {
    VmBroadcast constant vm = VmBroadcast(address(uint160(uint256(keccak256("hevm cheat code")))));

    function run() external returns (NumberSlideSessions game) {
        vm.startBroadcast();
        game = new NumberSlideSessions{salt: bytes32(0)}();
        vm.stopBroadcast();
    }
}
