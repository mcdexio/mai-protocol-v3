// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.7.4;

import "@openzeppelin/contracts-upgradeable/GSN/ContextUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/math/SafeMathUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/SafeERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/Initializable.sol";

import "../interface/IPoolCreatorFull.sol";

abstract contract RewardDistribution is Initializable, ContextUpgradeable {
    using SafeMathUpgradeable for uint256;
    using SafeERC20Upgradeable for IERC20Upgradeable;

    IPoolCreatorFull public poolCreator;

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

    modifier onlyOwnerOfPoolCreator() {
        require(_msgSender() == poolCreator.owner(), "caller must be owner of pool creator");
        _;
    }

    // virtual methods
    function balanceOf(address account) public view virtual returns (uint256);

    function totalSupply() public view virtual returns (uint256);

    function __RewardDistribution_init_unchained(address poolCreator_)
        internal
        initializer
    {
        poolCreator = IPoolCreatorFull(poolCreator_);
    }

    function getRewardToken() public view returns (IERC20Upgradeable) {
        address mcb = poolCreator.getMCBToken();
        return IERC20Upgradeable(mcb);
    }

    /**
     * @notice  Set reward distribution rate. If there is unfinished distribution, the end block will be changed
     *          according to change of newRewardRate.
     *
     * @param   newRewardRate   New reward distribution rate.
     */
    function setRewardRate(uint256 newRewardRate)
        external
        virtual
        onlyOwnerOfPoolCreator
        updateReward(address(0))
    {
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

    /**
     * @notice  Add new distributable reward to current pool, this will extend an exist distribution or
     *          start a new distribution if previous one is already ended.
     *
     * @param   reward  Amount of reward to add.
     */
    function notifyRewardAmount(uint256 reward)
        external
        virtual
        onlyOwnerOfPoolCreator
        updateReward(address(0))
    {
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

    /**
     * @notice  Return end block if last distribution is done or current timestamp.
     */
    function lastBlockRewardApplicable() public view returns (uint256) {
        return block.number <= periodFinish ? block.number : periodFinish;
    }

    /**
     * @notice  Return the per token amount of reward.
     *          The expected reward of user is: [amount of share] x rewardPerToken - claimedReward.
     */
    function rewardPerToken() public view returns (uint256) {
        if (totalSupply() == 0) {
            return rewardPerTokenStored;
        }
        return
            rewardPerTokenStored.add(
                lastBlockRewardApplicable().sub(lastUpdateTime).mul(rewardRate).mul(1e18).div(
                    totalSupply()
                )
            );
    }

    /**
     * @notice  Return real time reward of account.
     */
    function earned(address account) public view returns (uint256) {
        return
            balanceOf(account)
                .mul(rewardPerToken().sub(userRewardPerTokenPaid[account]))
                .div(1e18)
                .add(rewards[account]);
    }

    /**
     * @notice  Claim all remaining reward of account.
     */
    function getReward() public updateReward(_msgSender()) {
        address account = _msgSender();
        uint256 reward = earned(account);
        if (reward > 0) {
            rewards[account] = 0;
            getRewardToken().safeTransfer(account, reward);
            emit RewardPaid(account, reward);
        }
    }

    function _updateReward(address account) internal {
        rewardPerTokenStored = rewardPerToken();
        lastUpdateTime = lastBlockRewardApplicable();
        if (account != address(0)) {
            rewards[account] = earned(account);
            userRewardPerTokenPaid[account] = rewardPerTokenStored;
        }
    }

    bytes32[50] private __gap;
}
