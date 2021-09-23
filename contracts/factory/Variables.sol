// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.7.4;

import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/Initializable.sol";

import "../interface/IVariables.sol";

contract Variables is Initializable, OwnableUpgradeable, IVariables {
    bytes32 internal _reserved1;
    address internal _symbolService;
    address internal _vault;
    int256 internal _vaultFeeRate;

    event SetVaultFeeRate(int256 prevFeeRate, int256 newFeeRate);
    event SetVault(address previousVault, address newVault);
    event SetKeeper(address previousKeeper, address newKeeper);
    event SetRewardDistributor(address previousRewardDistributor, address newRewardDistributor);

    function __Variables_init(
        address symbolService_,
        address vault_,
        int256 vaultFeeRate_
    ) internal initializer {
        require(symbolService_ != address(0), "invalid symbol service address");
        require(vault_ != address(0), "invalid vault address");
        require(vaultFeeRate_ >= 0, "negative vault fee rate");

        _symbolService = symbolService_;
        _vault = vault_;
        _vaultFeeRate = vaultFeeRate_;
    }

    /**
     * @notice Owner of version control.
     */
    function owner()
        public
        view
        virtual
        override(IVariables, OwnableUpgradeable)
        returns (address)
    {
        return OwnableUpgradeable.owner();
    }

    /**
     * @notice Get the address of the vault
     * @return address The address of the vault
     */
    function getVault() public view override returns (address) {
        return _vault;
    }

    /**
     * @notice Get the vault fee rate
     * @return int256 The vault fee rate
     */
    function getVaultFeeRate() public view override returns (int256) {
        return _vaultFeeRate;
    }

    /**
     * @notice  Set the vault address. Can only called by owner(dao).
     *
     * @param   newVault    The new value of the vault fee rate
     */
    function setVault(address newVault) external override onlyOwner {
        require(newVault != address(0), "new vault is zero-address");
        require(_vault != newVault, "new vault is already current vault");
        emit SetVault(_vault, newVault);
        _vault = newVault;
    }

    /**
     * @notice  Set the vault fee rate. Can only called by owner(dao).
     *
     * @param   newVaultFeeRate The new value of the vault fee rate
     */
    function setVaultFeeRate(int256 newVaultFeeRate) external override onlyOwner {
        require(newVaultFeeRate >= 0, "negative vault fee rate");
        require(newVaultFeeRate != _vaultFeeRate, "unchanged vault fee rate");

        emit SetVaultFeeRate(_vaultFeeRate, newVaultFeeRate);
        _vaultFeeRate = newVaultFeeRate;
    }

    /**
     * @notice Get the address of the access controller. It's always its own address.
     *
     * @return address The address of the access controller.
     */
    function getAccessController() external view override returns (address) {
        return address(this);
    }

    /**
     * @notice  Get the address of the symbol service.
     *
     * @return  Address The address of the symbol service.
     */
    function getSymbolService() external view override returns (address) {
        return _symbolService;
    }

    /**
     * @notice  Get the address of the mcb token.
     * @dev     [ConfirmBeforeDeployment]
     *
     * @return  Address The address of the mcb token.
     */
    function getMCBToken() public pure override returns (address) {
        // arb1
        // return address(0x4e352cF164E64ADCBad318C3a1e222E9EBa4Ce42);
        // bsc
        return address(0x5fE80d2CD054645b9419657d3d10d26391780A7B);
    }
}
