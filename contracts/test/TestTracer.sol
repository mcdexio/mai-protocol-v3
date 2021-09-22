// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.7.4;
pragma experimental ABIEncoderV2;

import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts/utils/EnumerableSet.sol";
import "../factory/Tracer.sol";

contract TestTracer is Tracer {
    using SafeMath for uint256;
    using SafeMathExt for uint256;
    using EnumerableSet for EnumerableSet.AddressSet;
    using EnumerableSet for EnumerableSet.Bytes32Set;

    function registerLiquidityPool(address liquidityPool, address operator) public {
        _registerLiquidityPool(liquidityPool, operator);
    }

    function isUniverseSettled() public pure returns (bool) {
        return false;
    }
}
