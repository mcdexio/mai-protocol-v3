// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.7.4;

import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/AddressUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/math/SafeMathUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/EnumerableSetUpgradeable.sol";

import "../interface/IUpgradeableProxy.sol";
import "../interface/IVersionControl.sol";

import "../libraries/SafeMathExt.sol";

contract VersionControl is OwnableUpgradeable, IVersionControl {
    using Utils for EnumerableSetUpgradeable.Bytes32Set;
    using SafeMathExt for uint256;
    using AddressUpgradeable for address;
    using SafeMathUpgradeable for uint256;
    using EnumerableSetUpgradeable for EnumerableSetUpgradeable.Bytes32Set;

    struct VersionDescription {
        address[] liquidityPoolTemplate;
        address governorTemplate;
        uint256 compatibility;
    }

    EnumerableSetUpgradeable.Bytes32Set internal _versionKeys;
    mapping(bytes32 => VersionDescription) internal _versionDescriptions;
    mapping(bytes32 => bytes32) internal _deployedVersions;

    event AddVersion(
        bytes32 versionKey,
        address[] liquidityPoolTemplate,
        address governorTemplate,
        address indexed creator,
        uint256 compatibility,
        string note
    );

    /**
     * @notice Owner of version control.
     */
    function owner()
        public
        view
        virtual
        override(IVersionControl, OwnableUpgradeable)
        returns (address)
    {
        return OwnableUpgradeable.owner();
    }

    /**
     * @notice  Create a new version with template of liquidity pool and governor.
     *
     * @param   liquidityPoolTemplate   The address of the liquidityPool implementation.
     * @param   governorTemplate        The address of the governor implementation.
     * @param   compatibility           The compatibility of the implementation
     * @param   note                    The note of the version, only in log.
     * @return  versionKey              The key of the version added.
     */
    function addVersion(
        address[] memory liquidityPoolTemplate,
        address governorTemplate,
        uint256 compatibility,
        string calldata note
    ) external onlyOwner returns (bytes32 versionKey) {
        require(liquidityPoolTemplate.length > 0, "empty implementation");
        for (uint256 i = 0; i < liquidityPoolTemplate.length; i++) {
            require(liquidityPoolTemplate[i].isContract(), "implementation must be contract");
        }
        require(governorTemplate.isContract(), "implementation must be contract");

        versionKey = _getVersionHash(liquidityPoolTemplate, governorTemplate);
        require(!isVersionKeyValid(versionKey), "implementation already exists");

        _versionDescriptions[versionKey] = VersionDescription({
            liquidityPoolTemplate: liquidityPoolTemplate,
            governorTemplate: governorTemplate,
            compatibility: compatibility
        });
        _versionKeys.add(versionKey);

        emit AddVersion(
            versionKey,
            liquidityPoolTemplate,
            governorTemplate,
            msg.sender,
            compatibility,
            note
        );
    }

    /**
     * @notice  Get the latest created key of template. Revert if there is no key yet.
     *
     * @return  latestVersionKey    The key of the latest template of liquidity pool and governor.
     */
    function getLatestVersion() public view override returns (bytes32 latestVersionKey) {
        require(_versionKeys.length() > 0, "no version");
        latestVersionKey = _versionKeys.at(_versionKeys.length() - 1);
    }

    /**
     * @notice  Get the details of the version.
     *
     * @param   versionKey              The key of the version to get.
     * @return  liquidityPoolTemplate   The address of the liquidity pool template.
     * @return  governorTemplate        The address of the governor template.
     * @return  compatibility           The compatibility of the specified version.
     */
    function getVersion(bytes32 versionKey)
        public
        view
        override
        returns (
            address[] memory liquidityPoolTemplate,
            address governorTemplate,
            uint256 compatibility
        )
    {
        require(isVersionKeyValid(versionKey), "implementation is invalid");
        VersionDescription storage version = _versionDescriptions[versionKey];
        liquidityPoolTemplate = new address[](version.liquidityPoolTemplate.length);
        for (uint256 i = 0; i < version.liquidityPoolTemplate.length; i++) {
            liquidityPoolTemplate[i] = version.liquidityPoolTemplate[i];
        }
        governorTemplate = version.governorTemplate;
        compatibility = version.compatibility;
    }

    /**
     * @notice  Get the description of the implementation of liquidity pool.
     *          Description contains creator, create time, compatibility and note
     *
     * @param  liquidityPool        The address of the liquidity pool.
     * @param  governor             The address of the governor.
     * @return appliedVersionKey    The version key of given liquidity pool and governor.
     */
    function getAppliedVersionKey(address liquidityPool, address governor)
        external
        view
        override
        returns (bytes32 appliedVersionKey)
    {
        bytes32 deployedAddressHash = _getDeploymentHash(liquidityPool, governor);
        appliedVersionKey = _deployedVersions[deployedAddressHash];
    }

    /**
     * @notice  Check if a key is valid (exists).
     *
     * @param   versionKey  The key of the version to test.
     * @return  isValid     Return true if the version of given key is valid.
     */
    function isVersionKeyValid(bytes32 versionKey) public view override returns (bool isValid) {
        isValid = _versionKeys.contains(versionKey);
    }

    /**
     * @notice  Check if the implementation of liquidity pool target is compatible with the implementation base.
     *          Being compatible means having larger compatibility.
     *
     * @param   targetVersionKey    The key of the version to be upgraded to.
     * @param   baseVersionKey      The key of the version to be upgraded from.
     * @return  isCompatible        True if the target version is compatible with the base version.
     */
    function isVersionCompatible(bytes32 targetVersionKey, bytes32 baseVersionKey)
        public
        view
        override
        returns (bool isCompatible)
    {
        require(isVersionKeyValid(targetVersionKey), "target version is invalid");
        require(isVersionKeyValid(baseVersionKey), "base version is invalid");
        isCompatible =
            _versionDescriptions[targetVersionKey].compatibility >=
            _versionDescriptions[baseVersionKey].compatibility;
    }

    /**
     * @dev     Get a certain number of implementations of liquidity pool within range [begin, end).
     *
     * @param   begin       The index of first element to retrieve.
     * @param   end         The end index of element, exclusive.
     * @return  versionKeys An array contains current version keys.
     */
    function listAvailableVersions(uint256 begin, uint256 end)
        external
        view
        override
        returns (bytes32[] memory versionKeys)
    {
        versionKeys = _versionKeys.toArray(begin, end);
    }

    function _updateDeployedInstances(
        bytes32 versionKeys,
        address liquidityPool,
        address governor
    ) internal {
        bytes32 deployedAddressHash = _getDeploymentHash(liquidityPool, governor);
        _deployedVersions[deployedAddressHash] = versionKeys;
    }

    function _validateUpgradeVersion(
        bytes32 targetVersionKey,
        address liquidityPool,
        address governor
    ) internal view {
        bytes32 deployedAddressHash = _getDeploymentHash(liquidityPool, governor);
        bytes32 baseVersionKey = _deployedVersions[deployedAddressHash];
        require(
            isVersionCompatible(targetVersionKey, baseVersionKey),
            "the target version is not compatible"
        );
    }

    function _getVersionHash(address[] memory liquidityPoolTemplate, address governorTemplate)
        internal
        pure
        returns (bytes32)
    {
        return keccak256(abi.encodePacked(liquidityPoolTemplate, governorTemplate));
    }

    function _getDeploymentHash(address liquidityPool, address governor)
        internal
        pure
        returns (bytes32)
    {
        return keccak256(abi.encodePacked(liquidityPool, governor));
    }
}
