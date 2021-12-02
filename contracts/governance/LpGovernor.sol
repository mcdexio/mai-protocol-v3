// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.7.4;
pragma experimental ABIEncoderV2;

import "@openzeppelin/contracts-upgradeable/GSN/ContextUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/ERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/math/SafeMathUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/Initializable.sol";

import "./GovernorAlpha.sol";
import "./RewardDistributionV2.sol";
import "../interface/IGovernor.sol";
import "../interface/ILiquidityPoolGetter.sol";

contract LpGovernor is
    IGovernor,
    Initializable,
    ContextUpgradeable,
    ERC20Upgradeable,
    GovernorAlpha,
    RewardDistributionV2
{
    using SafeMathUpgradeable for uint256;

    // admin:  to mint/burn token
    address internal _minter;

    mapping(address => uint256) public lastMintBlock;

    /**
     * @notice  Initialize LpGovernor instance.
     *
     * @param   name        ERC20 name of token.
     * @param   symbol      ERC20 symbol of token.
     * @param   minter      The role that has privilege to mint / burn token.
     * @param   target      The target of execution, all action of proposal will be send to target.
     * @param   mcbToken    The address of MCB ERC20 token, controlled by dao.
     * @param   poolCreator The address of pool creator, whose owner will be the owner of governor.
     */
    function initialize(
        string memory name,
        string memory symbol,
        address minter,
        address target,
        address mcbToken,
        address poolCreator
    ) external virtual override initializer {
        __ERC20_init_unchained(name, symbol);
        __GovernorAlpha_init_unchained(target);
        __RewardDistribution_init_unchained(mcbToken, poolCreator);

        _minter = minter;
        _target = target;
    }

    function getMinter() public view returns (address) {
        return _minter;
    }

    function getTarget() public view virtual override(IGovernor, GovernorAlpha) returns (address) {
        return GovernorAlpha.getTarget();
    }

    /**
     * @notice  Mint token to account.
     */
    function mint(address account, uint256 amount) public virtual override {
        require(_msgSender() == _minter, "must be minter to mint");
        lastMintBlock[account] = _getBlockNumber();
        _mint(account, amount);
    }

    /**
     * @notice  Burn token from account. Voting will block also block burning.
     */
    function burn(address account, uint256 amount) public virtual override {
        require(_msgSender() == _minter, "must be minter to burn");
        _burn(account, amount);
    }

    function isLocked(address account) public virtual returns (bool) {
        bool isTransferLocked = _getBlockNumber() < lastMintBlock[account].add(_getTransferDelay());
        bool isVoteLocked = GovernorAlpha.isLockedByVoting(account);
        return isTransferLocked || isVoteLocked;
    }

    /**
     * @notice  Override ERC20 balanceOf.
     */
    function balanceOf(address account)
        public
        view
        virtual
        override(IGovernor, ERC20Upgradeable, GovernorAlpha, RewardDistributionV2)
        returns (uint256)
    {
        return ERC20Upgradeable.balanceOf(account);
    }

    /**
     * @notice  Override ERC20 balanceOf.
     */
    function totalSupply()
        public
        view
        virtual
        override(IGovernor, ERC20Upgradeable, GovernorAlpha, RewardDistributionV2)
        returns (uint256)
    {
        return ERC20Upgradeable.totalSupply();
    }

    function _beforeTokenTransfer(
        address sender,
        address recipient,
        uint256 amount
    ) internal virtual override {
        require(!isLocked(sender), "sender is locked");
        _updateRewards(sender);
        _updateRewards(recipient);
        super._beforeTokenTransfer(sender, recipient, amount);
    }

    function _getTransferDelay() internal view virtual returns (uint256) {
        (, , , , uint256[6] memory uintNums) = ILiquidityPoolGetter(_target).getLiquidityPoolInfo();
        return uintNums[5];
    }

    function _getOperator()
        internal
        view
        virtual
        override(GovernorAlpha, RewardDistributionV2)
        returns (address)
    {
        (, , address[7] memory addresses, , ) = ILiquidityPoolGetter(_target)
            .getLiquidityPoolInfo();
        return addresses[1];
    }

    function _getBlockNumber()
        internal
        view
        virtual
        override(GovernorAlpha, RewardDistributionV2)
        returns (uint256)
    {
        return block.number;
    }

    bytes32[49] private __gap;
}
