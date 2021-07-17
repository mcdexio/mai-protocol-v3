// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.7.4;

import "hardhat/console.sol";

contract MockLiquidityPool {
    address public operator;

    function setOperatorDebug(address operator_) public {
        operator = operator_;
    }

    function forceToSetEmergencyState(uint256 perpetualIndex, int256 settlementPrice) external {
        console.log(
            "MockLiquidityPool :: forceToSetEmergencyState(%s, %s) called",
            perpetualIndex,
            uint256(settlementPrice)
        );
    }

    function setOperator(address newOperator) external {
        console.log("MockLiquidityPool :: setOperator(%s) called", newOperator);
    }

    function setFastCreationEnabled(bool enabled) external {
        console.log("MockLiquidityPool :: setFastCreationEnabled(%s) called", enabled ? 1 : 0);
    }

    function getLiquidityPoolInfo()
        external
        view
        returns (
            bool isRunning,
            bool isFastCreationEnabled,
            // [0] creator,
            // [1] operator,
            // [2] transferringOperator,
            // [3] governor,
            // [4] shareToken,
            // [5] collateralToken,
            // [6] vault,
            address[7] memory addresses,
            // [0] vaultFeeRate,
            // [1] poolCash,
            // [2] insuranceFundCap,
            // [3] insuranceFund,
            // [4] donatedInsuranceFund,
            int256[5] memory intNums,
            // [0] collateralDecimals,
            // [1] perpetualCount,
            // [2] fundingTime,
            // [3] operatorExpiration,
            uint256[6] memory uintNums
        )
    {
        addresses[1] = operator;
    }
}
