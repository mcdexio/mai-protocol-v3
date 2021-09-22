// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity 0.7.4;

import "./IProxyAdmin.sol";

interface IVersionControl {
    function owner() external view returns (address);

    function getLatestVersion() external view returns (bytes32 latestVersionKey);

    /**
     * @notice  Get the details of the version.
     *
     * @param   versionKey              The key of the version to get.
     * @return  liquidityPoolTemplate   The address of the liquidity pool template.
     * @return  governorTemplate        The address of the governor template.
     * @return  compatibility           The compatibility of the specified version.
     */
    function getVersion(bytes32 versionKey)
        external
        view
        returns (
            address[] memory liquidityPoolTemplate,
            address governorTemplate,
            uint256 compatibility
        );

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
        returns (bytes32 appliedVersionKey);

    /**
     * @notice  Check if a key is valid (exists).
     *
     * @param   versionKey  The key of the version to test.
     * @return  isValid     Return true if the version of given key is valid.
     */
    function isVersionKeyValid(bytes32 versionKey) external view returns (bool isValid);

    /**
     * @notice  Check if the implementation of liquidity pool target is compatible with the implementation base.
     *          Being compatible means having larger compatibility.
     *
     * @param   targetVersionKey    The key of the version to be upgraded to.
     * @param   baseVersionKey      The key of the version to be upgraded from.
     * @return  isCompatible        True if the target version is compatible with the base version.
     */
    function isVersionCompatible(bytes32 targetVersionKey, bytes32 baseVersionKey)
        external
        view
        returns (bool isCompatible);

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
        returns (bytes32[] memory versionKeys);
}
