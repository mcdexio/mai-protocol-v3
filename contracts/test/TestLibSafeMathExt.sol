// SPDX-License-Identifier: BUSL-1.1
pragma solidity >=0.7.4;

import "../libraries/SafeMathExt.sol";

contract TestLibSafeMathExt {
    function uwmul(uint256 x, uint256 y) public pure returns (uint256) {
        return SafeMathExt.wmul(x, y);
    }

    function uwdiv(uint256 x, uint256 y) public pure returns (uint256) {
        return SafeMathExt.wdiv(x, y);
    }

    function uwfrac(
        uint256 x,
        uint256 y,
        uint256 z
    ) public pure returns (uint256) {
        return SafeMathExt.wfrac(x, y, z);
    }

    function wmul(int256 x, int256 y) public pure returns (int256) {
        return SafeMathExt.wmul(x, y);
    }

    function wdiv(int256 x, int256 y) public pure returns (int256) {
        return SafeMathExt.wdiv(x, y);
    }

    function wfrac(
        int256 x,
        int256 y,
        int256 z
    ) public pure returns (int256) {
        return SafeMathExt.wfrac(x, y, z);
    }

    function wmul(
        int256 x,
        int256 y,
        Round round
    ) public pure returns (int256) {
        return SafeMathExt.wmul(x, y, round);
    }

    function wdiv(
        int256 x,
        int256 y,
        Round round
    ) public pure returns (int256) {
        return SafeMathExt.wdiv(x, y, round);
    }

    function wfrac(
        int256 x,
        int256 y,
        int256 z,
        Round round
    ) public pure returns (int256) {
        return SafeMathExt.wfrac(x, y, z, round);
    }

    function abs(int256 x) public pure returns (int256) {
        return SafeMathExt.abs(x);
    }

    function neg(int256 x) public pure returns (int256) {
        return SafeMathExt.neg(x);
    }

    function div(
        int256 x,
        int256 y,
        Round round
    ) public pure returns (int256) {
        return SafeMathExt.div(x, y, round);
    }

    function max(int256 x, int256 y) public pure returns (int256) {
        return SafeMathExt.max(x, y);
    }

    function min(int256 x, int256 y) public pure returns (int256) {
        return SafeMathExt.min(x, y);
    }

    function umax(uint256 x, uint256 y) public pure returns (uint256) {
        return SafeMathExt.max(x, y);
    }

    function umin(uint256 x, uint256 y) public pure returns (uint256) {
        return SafeMathExt.min(x, y);
    }
}
