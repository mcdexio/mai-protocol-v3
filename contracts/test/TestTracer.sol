// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.7.4;
pragma experimental ABIEncoderV2;

import "../factory/Tracer.sol";

contract TestTracer is Tracer {
    using EnumerableSetUpgradeable for EnumerableSetUpgradeable.AddressSet;

    function registerLiquidityPool(address liquidityPool, address operator) external {
        _registerLiquidityPool(liquidityPool, operator);
    }

    function isUniverseSettled() public pure returns (bool) {
        return false;
    }
}
