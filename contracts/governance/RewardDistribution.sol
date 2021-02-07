// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.7.4;

import "@openzeppelin/contracts-upgradeable/GSN/ContextUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/math/SafeMathUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/SafeERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/Initializable.sol";

abstract contract RewardDistribution is Initializable, ContextUpgradeable {
    using SafeMathUpgradeable for uint256;
    using SafeERC20Upgradeable for IERC20Upgradeable;

    // admin:  to mint/burn token
    address internal _distributor;

    IERC20Upgradeable public rewardToken;

    uint256 public periodFinish;
    uint256 public rewardRate;
    uint256 public lastUpdateTime;
    uint256 public rewardPerTokenStored;
    address public rewardDistribution;

    mapping(address => uint256) public userRewardPerTokenPaid;
    mapping(address => uint256) public rewards;

    event RewardPaid(address indexed user, uint256 reward);
    event RewardAdded(uint256 reward, uint256 periodFinish);
    event RewardRateChanged(uint256 previousRate, uint256 currentRate, uint256 periodFinish);

    modifier updateReward(address account) {
        _updateReward(account);
        _;
    }

    // virtual methods
    function balanceOf(address account) public view virtual returns (uint256);

    function totalSupply() public view virtual returns (uint256);

    function __RewardDistribution_init_unchained(address rewardToken_, address distributor)
        internal
        initializer
    {
        rewardToken = IERC20Upgradeable(rewardToken_);
        _distributor = distributor;
    }

    function setRewardRate(uint256 newRewardRate) external virtual updateReward(address(0)) {
        require(_msgSender() == _distributor, "must be distributor to set reward rate");
        if (newRewardRate == 0) {
            periodFinish = block.number;
        } else if (periodFinish != 0) {
            periodFinish = periodFinish.sub(lastUpdateTime).mul(rewardRate).div(newRewardRate).add(
                block.number
            );
        }
        emit RewardRateChanged(rewardRate, newRewardRate, periodFinish);
        rewardRate = newRewardRate;
    }

    function notifyRewardAmount(uint256 reward) external virtual updateReward(address(0)) {
        require(_msgSender() == _distributor, "must be distributor to notify reward amount");
        require(rewardRate > 0, "rewardRate is zero");
        uint256 period = reward.div(rewardRate);
        // already finished or not initialized
        if (block.number > periodFinish) {
            lastUpdateTime = block.number;
            periodFinish = block.number.add(period);
            emit RewardAdded(reward, periodFinish);
        } else {
            // not finished or not initialized
            periodFinish = periodFinish.add(period);
            emit RewardAdded(reward, periodFinish);
        }
    }

    function lastTimeRewardApplicable() public view returns (uint256) {
        return block.number <= periodFinish ? block.number : periodFinish;
    }

    function rewardPerToken() public view returns (uint256) {
        if (totalSupply() == 0) {
            return rewardPerTokenStored;
        }
        return
            rewardPerTokenStored.add(
                lastTimeRewardApplicable().sub(lastUpdateTime).mul(rewardRate).mul(1e18).div(
                    totalSupply()
                )
            );
    }

    // user interface
    function earned(address account) public view returns (uint256) {
        return
            balanceOf(account)
                .mul(rewardPerToken().sub(userRewardPerTokenPaid[account]))
                .div(1e18)
                .add(rewards[account]);
    }

    function getReward() public updateReward(_msgSender()) {
        address account = _msgSender();
        uint256 reward = earned(account);
        if (reward > 0) {
            rewards[account] = 0;
            rewardToken.safeTransfer(account, reward);
            emit RewardPaid(account, reward);
        }
    }

    function _updateReward(address account) internal {
        rewardPerTokenStored = rewardPerToken();
        lastUpdateTime = lastTimeRewardApplicable();
        if (account != address(0)) {
            rewards[account] = earned(account);
            userRewardPerTokenPaid[account] = rewardPerTokenStored;
        }
    }

    bytes32[50] private __gap;
}