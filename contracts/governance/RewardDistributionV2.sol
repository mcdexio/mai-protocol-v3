// SPDX-License-Identifier: GPL
pragma solidity 0.7.4;

import "@openzeppelin/contracts-upgradeable/GSN/ContextUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/AddressUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/math/SafeMathUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/SafeERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/EnumerableSetUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/Initializable.sol";

import "../interface/IPoolCreatorFull.sol";
import "../libraries/SafeMathExt.sol";

struct Distribution {
    address rewardToken;
    uint256 periodFinish;
    uint256 rewardRate;
    uint256 lastUpdateTime;
    uint256 rewardPerTokenStored;
    address __placeholder;
    mapping(address => uint256) userRewardPerTokenPaid;
    mapping(address => uint256) rewards;
}

// storage of V1, DO NOT change the types of vars
contract RewardDistributionV2Storage is Initializable, ContextUpgradeable {
    IPoolCreatorFull public poolCreator;

    // override v1 vars, edit this carefully
    Distribution internal _mainDistribution;
    // new vars for v2
    address[] internal _subRewardTokens;
    mapping(address => Distribution) internal _subDistributions;

    bytes32[48] private __gap;
}

abstract contract RewardDistributionV2 is RewardDistributionV2Storage {
    using SafeMathExt for uint256;
    using AddressUpgradeable for address;
    using SafeMathUpgradeable for uint256;
    using SafeERC20Upgradeable for IERC20Upgradeable;
    using EnumerableSetUpgradeable for EnumerableSetUpgradeable.AddressSet;

    event DistributionCreated(address indexed token, uint256 rewardRate, uint256 rewardAmount);
    event RewardPaid(address indexed token, address indexed user, uint256 reward);
    event RewardAdded(address indexed token, uint256 reward, uint256 periodFinish);
    event RewardRateChanged(
        address indexed token,
        uint256 previousRate,
        uint256 currentRate,
        uint256 periodFinish
    );

    modifier onlyDistributor(address token) {
        if (token == _mainDistribution.rewardToken) {
            require(_msgSender() == poolCreator.owner(), "caller must be owner of pool creator");
        } else {
            require(_msgSender() == _getOperator(), "caller must be operator");
        }
        _;
    }

    // virtual methods
    function balanceOf(address account) public view virtual returns (uint256);

    function totalSupply() public view virtual returns (uint256);

    function _getOperator() internal view virtual returns (address);

    function __RewardDistribution_init_unchained(address mcbToken, address poolCreator_)
        internal
        initializer
    {
        poolCreator = IPoolCreatorFull(poolCreator_);
        _mainDistribution.rewardToken = mcbToken;
    }

    /**
     * @notice  Create a new reward status for given token, setting the reward rate. Duplicated creation will be reverted.
     */
    function createDistribution(
        address token,
        uint256 rewardRate,
        uint256 rewardAmount
    ) external onlyDistributor(token) {
        require(token != address(0), "invalid reward token");
        require(token.isContract(), "reward token must be contract");
        require(!_hasDistribution(token), "status already exists");

        _subRewardTokens.push(token);
        _subDistributions[token].rewardToken = token;

        _setRewardRate(_getDistribution(token), rewardRate);
        _notifyRewardAmount(_getDistribution(token), rewardAmount);

        emit DistributionCreated(token, rewardRate, rewardAmount);
    }

    /**
     * @notice  Set reward distribution rate. If there is unfinished distribution, the end time will be changed
     *          according to change of newRewardRate.
     *
     * @param   newRewardRate   New reward distribution rate.
     */
    function setRewardRate(address token, uint256 newRewardRate)
        external
        virtual
        onlyDistributor(token)
    {
        _updateReward(_getDistribution(token), address(0));
        _setRewardRate(_getDistribution(token), newRewardRate);
    }

    /**
     * @notice  Add new distributable reward to current pool, this will extend an exist distribution or
     *          start a new distribution if previous one is already ended.
     *
     * @param   reward  Amount of reward to add.
     */
    function notifyRewardAmount(address token, uint256 reward)
        external
        virtual
        onlyDistributor(token)
    {
        _updateReward(_getDistribution(token), address(0));
        _notifyRewardAmount(_getDistribution(token), reward);
    }

    /**
     * @notice  Return real time reward of account.
     */
    function distributionStatuses()
        public
        view
        returns (
            address[] memory tokens,
            uint256[] memory rewardRates,
            uint256[] memory periodFinishes,
            uint256[] memory lastUpdateTime,
            uint256[] memory rewardPerTokenStored
        )
    {
        uint256 length = _subRewardTokens.length;
        tokens = new address[](length + 1);
        rewardRates = new uint256[](length + 1);
        periodFinishes = new uint256[](length + 1);
        lastUpdateTime = new uint256[](length + 1);
        rewardPerTokenStored = new uint256[](length + 1);

        tokens[0] = _mainDistribution.rewardToken;
        rewardRates[0] = _mainDistribution.rewardRate;
        periodFinishes[0] = _mainDistribution.periodFinish;
        lastUpdateTime[0] = _mainDistribution.lastUpdateTime;
        rewardPerTokenStored[0] = _mainDistribution.rewardPerTokenStored;

        for (uint256 i = 0; i < length; i++) {
            Distribution storage distribution = _subDistributions[_subRewardTokens[i]];
            tokens[i + 1] = distribution.rewardToken;
            rewardRates[i + 1] = distribution.rewardRate;
            periodFinishes[i + 1] = distribution.periodFinish;
            lastUpdateTime[i + 1] = distribution.lastUpdateTime;
            rewardPerTokenStored[i + 1] = distribution.rewardPerTokenStored;
        }
    }

    /**
     * @notice  Return real time reward of account.
     */
    function allEarned(address account)
        public
        view
        returns (address[] memory tokens, uint256[] memory earnedAmounts)
    {
        uint256 length = _subRewardTokens.length;
        tokens = new address[](length + 1);
        earnedAmounts = new uint256[](length + 1);

        tokens[0] = _mainDistribution.rewardToken;
        earnedAmounts[0] = _earned(_mainDistribution, account);

        for (uint256 i = 0; i < length; i++) {
            tokens[i + 1] = _subRewardTokens[i];
            earnedAmounts[i + 1] = _earned(_subDistributions[_subRewardTokens[i]], account);
        }
    }

    /**
     * @notice  Claim remaining reward of a token for caller.
     */
    function getAllRewards() public {
        address account = _msgSender();
        _updateRewards(account);
        _getReward(_mainDistribution, account);
        uint256 length = _subRewardTokens.length;
        for (uint256 i = 0; i < length; i++) {
            _getReward(_subDistributions[_subRewardTokens[i]], account);
        }
    }

    function _hasDistribution(address token) public view returns (bool) {
        return
            (_mainDistribution.rewardToken == token) ||
            (_subDistributions[token].rewardToken == token);
    }

    function _getDistribution(address token) internal view returns (Distribution storage) {
        require(_hasDistribution(token), "distribution not exists");
        if (_mainDistribution.rewardToken == token) {
            return _mainDistribution;
        } else {
            return _subDistributions[token];
        }
    }

    function _lastBlockRewardApplicable(Distribution storage distribution)
        internal
        view
        returns (uint256)
    {
        return _getBlockNumber().min(distribution.periodFinish);
    }

    function _rewardPerToken(Distribution storage distribution) internal view returns (uint256) {
        if (totalSupply() == 0) {
            return distribution.rewardPerTokenStored;
        }
        return
            distribution.rewardPerTokenStored.add(
                _lastBlockRewardApplicable(distribution)
                    .sub(distribution.lastUpdateTime)
                    .mul(distribution.rewardRate)
                    .mul(1e18)
                    .div(totalSupply())
            );
    }

    function _earned(Distribution storage distribution, address account)
        internal
        view
        returns (uint256)
    {
        return
            balanceOf(account)
                .mul(
                    _rewardPerToken(distribution).sub(distribution.userRewardPerTokenPaid[account])
                )
                .div(1e18)
                .add(distribution.rewards[account]);
    }

    function _setRewardRate(Distribution storage distribution, uint256 newRewardRate) internal {
        if (newRewardRate == 0) {
            distribution.periodFinish = _getBlockNumber();
        } else if (distribution.periodFinish != 0) {
            distribution.periodFinish = distribution
                .periodFinish
                .sub(distribution.lastUpdateTime)
                .mul(distribution.rewardRate)
                .div(newRewardRate)
                .add(_getBlockNumber());
        }
        emit RewardRateChanged(
            distribution.rewardToken,
            distribution.rewardRate,
            newRewardRate,
            distribution.periodFinish
        );
        distribution.rewardRate = newRewardRate;
    }

    function _notifyRewardAmount(Distribution storage distribution, uint256 rewardAmount)
        internal
        virtual
    {
        require(distribution.rewardRate > 0, "rewardRate is zero");
        uint256 period = rewardAmount.div(distribution.rewardRate);
        // already finished or not initialized
        if (_getBlockNumber() > distribution.periodFinish) {
            distribution.lastUpdateTime = _getBlockNumber();
            distribution.periodFinish = _getBlockNumber().add(period);
        } else {
            // not finished or not initialized
            distribution.periodFinish = distribution.periodFinish.add(period);
        }
        emit RewardAdded(distribution.rewardToken, rewardAmount, distribution.periodFinish);
    }

    function _getReward(Distribution storage distribution, address account) internal {
        uint256 reward = _earned(distribution, account);
        if (reward > 0) {
            distribution.rewards[account] = 0;
            IERC20Upgradeable(distribution.rewardToken).safeTransfer(account, reward);
            emit RewardPaid(distribution.rewardToken, account, reward);
        }
    }

    function _updateReward(Distribution storage distribution, address account) internal {
        distribution.rewardPerTokenStored = _rewardPerToken(distribution);
        distribution.lastUpdateTime = _lastBlockRewardApplicable(distribution);
        if (account != address(0)) {
            distribution.rewards[account] = _earned(distribution, account);
            distribution.userRewardPerTokenPaid[account] = distribution.rewardPerTokenStored;
        }
    }

    function _updateRewards(address account) internal {
        _updateReward(_mainDistribution, account);
        uint256 length = _subRewardTokens.length;
        for (uint256 i = 0; i < length; i++) {
            _updateReward(_subDistributions[_subRewardTokens[i]], account);
        }
    }

    function _getBlockNumber() internal view virtual returns (uint256) {
        return block.number;
    }
}
