// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.7.4;
pragma experimental ABIEncoderV2;

import "../LiquidityPool.sol";
import "../LiquidityPoolHop1.sol";

contract LiquidityPoolAllHops is LiquidityPool, LiquidityPoolHop1 {}
