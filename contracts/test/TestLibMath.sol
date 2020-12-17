// SPDX-License-Identifier: UNLICENSED

pragma solidity >=0.7.4;

import "../libraries/Math.sol";

contract TestLibMath {

    function toInt256(uint256 x) public pure returns (int256) {
        return Math.toInt256(x);
    }

    function mostSignificantBit(uint256 x) public pure returns (uint8) {
        return Math.mostSignificantBit(x);
    }

    function sqrt(int256 y) public pure returns (int256) {
        return Math.sqrt(y);
    }

}
