// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.7.4;

import "@openzeppelin/contracts-upgradeable/GSN/ContextUpgradeable.sol";

import "./interface/IPoolCreatorFull.sol";
import "./module/LiquidityPoolModule.sol";
import "./module/LiquidityPoolModule2.sol";
import "./Type.sol";

contract Storage is ContextUpgradeable {
    using LiquidityPoolModule for LiquidityPoolStorage;
    using LiquidityPoolModule2 for LiquidityPoolStorage;

    LiquidityPoolStorage internal _liquidityPool;

    modifier onlyNotUniverseSettled() {
        require(!IPoolCreatorFull(_liquidityPool.creator).isUniverseSettled(), "universe settled");
        _;
    }
    
    modifier onlyExistedPerpetual(uint256 perpetualIndex) {
        require(perpetualIndex < _liquidityPool.perpetualCount, "perpetual not exist");
        _;
    }

    modifier syncState(bool ignoreTerminated) {
        uint256 currentTime = block.timestamp;
        _liquidityPool.updateFundingState(currentTime);
        _liquidityPool.updatePrice(ignoreTerminated);
        _;
        _liquidityPool.updateFundingRate();
    }

    modifier onlyAuthorized(address trader, uint256 privilege) {
        require(
            _liquidityPool.isAuthorized(trader, _msgSender(), privilege),
            "unauthorized caller"
        );
        _;
    }

    bytes32[28] private __gap;
}
