// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.7.4;
pragma experimental ABIEncoderV2;

import "../governance/LpGovernor.sol";

contract TestLpGovernor is LpGovernor {
    /// @notice The duration of voting on a proposal, in blocks
    function votingPeriod() public pure virtual override returns (uint256) {
        return 20;
    }

    function executionDelay() public pure virtual override returns (uint256) {
        return 20;
    }

    function unlockDelay() public pure virtual override returns (uint256) {
        return 20;
    }

    function setCreator(address creator_) public {
        _creator = IPoolCreatorFull(creator_);
    }

    function setTarget(address creator_) public {
        _creator = IPoolCreatorFull(creator_);
    }

    function _getTransferDelay() internal view virtual override returns (uint256) {
        if (_target == address(0)) return 0;
        return super._getTransferDelay();
    }

    function setRewardRateV1(uint256 newRewardRate) external virtual onlyDistributor(mcbToken) {
        _updateReward(_mainDistribution, address(0));
        _setRewardRate(_mainDistribution, mcbToken, newRewardRate);
    }

    function notifyRewardAmountV1(uint256 reward) external virtual onlyDistributor(mcbToken) {
        _updateReward(_mainDistribution, address(0));
        _notifyRewardAmount(_mainDistribution, mcbToken, reward);
    }

    function lastBlockRewardApplicableV1() public view returns (uint256) {
        return _lastBlockRewardApplicable(_mainDistribution);
    }

    function rewardPerTokenV1() public view returns (uint256) {
        return _rewardPerToken(_mainDistribution);
    }

    function earnedV1(address account) public view returns (uint256) {
        return _earned(_mainDistribution, account);
    }

    function getRewardV1() public {
        _updateReward(_mainDistribution, _msgSender());
        _getReward(_mainDistribution, mcbToken, _msgSender());
    }

    function lastUpdateTimeV1() public view returns (uint256) {
        return _mainDistribution.lastUpdateTime;
    }

    function periodFinishV1() public view returns (uint256) {
        return _mainDistribution.periodFinish;
    }

    function rewardsV1(address account) public view returns (uint256) {
        return _mainDistribution.rewards[account];
    }

    function userRewardPerTokenPaidV1(address account) public view returns (uint256) {
        return _mainDistribution.userRewardPerTokenPaid[account];
    }

    address public operator;

    function setOperator(address account) external {
        operator = account;
    }

    function _getOperator() internal view virtual override returns (address) {
        return operator;
    }
}
