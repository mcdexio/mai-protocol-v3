// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.7.4;
pragma experimental ABIEncoderV2;

import "../libraries/Utils.sol";
import "../Type.sol";

library OrderData {
    uint32 internal constant MASK_CLOSE_ONLY = 0x80000000;
    uint32 internal constant MASK_MARKET_ORDER = 0x40000000;
    uint32 internal constant MASK_STOP_LOSS_ORDER = 0x20000000;
    uint32 internal constant MASK_TAKE_PROFIT_ORDER = 0x10000000;
    uint32 internal constant MASK_USE_TARGET_LEVERAGE = 0x08000000;

    // old domain, will be removed in future
    string internal constant DOMAIN_NAME = "Mai Protocol v3";
    bytes32 internal constant EIP712_DOMAIN_TYPEHASH =
        keccak256(abi.encodePacked("EIP712Domain(string name)"));
    bytes32 internal constant DOMAIN_SEPARATOR =
        keccak256(abi.encodePacked(EIP712_DOMAIN_TYPEHASH, keccak256(bytes(DOMAIN_NAME))));
    bytes32 internal constant EIP712_ORDER_TYPE =
        keccak256(
            abi.encodePacked(
                "Order(address trader,address broker,address relayer,address referrer,address liquidityPool,",
                "int256 minTradeAmount,int256 amount,int256 limitPrice,int256 triggerPrice,uint256 chainID,",
                "uint64 expiredAt,uint32 perpetualIndex,uint32 brokerFeeLimit,uint32 flags,uint32 salt)"
            )
        );

    /*
     * @dev Check if the order is close-only order. Close-only order means the order can only close position
     *      of the trader
     * @param order The order object
     * @return bool True if the order is close-only order
     */
    function isCloseOnly(Order memory order) internal pure returns (bool) {
        return (order.flags & MASK_CLOSE_ONLY) > 0;
    }

    /*
     * @dev Check if the order is market order. Market order means the order which has no limit price, should be
     *      executed immediately
     * @param order The order object
     * @return bool True if the order is market order
     */
    function isMarketOrder(Order memory order) internal pure returns (bool) {
        return (order.flags & MASK_MARKET_ORDER) > 0;
    }

    /*
     * @dev Check if the order is stop-loss order. Stop-loss order means the order will trigger when the
     *      price is worst than the trigger price
     * @param order The order object
     * @return bool True if the order is stop-loss order
     */
    function isStopLossOrder(Order memory order) internal pure returns (bool) {
        return (order.flags & MASK_STOP_LOSS_ORDER) > 0;
    }

    /*
     * @dev Check if the order is take-profit order. Take-profit order means the order will trigger when
     *      the price is better than the trigger price
     * @param order The order object
     * @return bool True if the order is take-profit order
     */
    function isTakeProfitOrder(Order memory order) internal pure returns (bool) {
        return (order.flags & MASK_TAKE_PROFIT_ORDER) > 0;
    }

    /*
     * @dev Check if the flags contain close-only flag
     * @param flags The flags
     * @return bool True if the flags contain close-only flag
     */
    function isCloseOnly(uint32 flags) internal pure returns (bool) {
        return (flags & MASK_CLOSE_ONLY) > 0;
    }

    /*
     * @dev Check if the flags contain market flag
     * @param flags The flags
     * @return bool True if the flags contain market flag
     */
    function isMarketOrder(uint32 flags) internal pure returns (bool) {
        return (flags & MASK_MARKET_ORDER) > 0;
    }

    /*
     * @dev Check if the flags contain stop-loss flag
     * @param flags The flags
     * @return bool True if the flags contain stop-loss flag
     */
    function isStopLossOrder(uint32 flags) internal pure returns (bool) {
        return (flags & MASK_STOP_LOSS_ORDER) > 0;
    }

    /*
     * @dev Check if the flags contain take-profit flag
     * @param flags The flags
     * @return bool True if the flags contain take-profit flag
     */
    function isTakeProfitOrder(uint32 flags) internal pure returns (bool) {
        return (flags & MASK_TAKE_PROFIT_ORDER) > 0;
    }

    function oldUseTargetLeverage(uint32 flags) internal pure returns (bool) {
        return (flags & MASK_USE_TARGET_LEVERAGE) > 0;
    }

    function newUseTargetLeverage(uint32 flags) internal pure returns (bool) {
        return getTargetLeverageByFlags(flags) > 0;
    }

    function getTargetLeverageByFlags(uint32 flags) internal pure returns (int256) {
        return int256((flags >> 7) & 0xfffff) * 10**16;
    }

    function useTargetLeverage(uint32 flags) internal pure returns (bool) {
        bool _oldUseTargetLeverage = oldUseTargetLeverage(flags);
        bool _newUseTargetLeverage = newUseTargetLeverage(flags);
        require(!(_oldUseTargetLeverage && _newUseTargetLeverage), "invalid flags");
        return _oldUseTargetLeverage || _newUseTargetLeverage;
    }

    /*
     * @dev Get the hash of the order
     * @param order The order object
     * @return bytes32 The hash of the order
     */
    function getOrderHash(Order memory order) internal pure returns (bytes32) {
        bytes32 result = keccak256(abi.encode(EIP712_ORDER_TYPE, order));
        return keccak256(abi.encodePacked("\x19\x01", DOMAIN_SEPARATOR, result));
    }

    /*
     * @dev Decode the signature from the data
     * @param data The data object to decode
     * @return signature The signature
     */
    function decodeSignature(bytes memory data) internal pure returns (bytes memory signature) {
        require(data.length >= 350, "broken data");
        bytes32 r;
        bytes32 s;
        uint8 v;
        uint8 signType;
        assembly {
            r := mload(add(data, 318))
            s := mload(add(data, 350))
            v := byte(24, mload(add(data, 292)))
            signType := byte(25, mload(add(data, 292)))
        }
        signature = abi.encodePacked(r, s, v, signType);
    }

    /*
     * @dev Decode the order from the data
     * @param data The data object to decode
     * @return order The order
     */
    function decodeOrderData(bytes memory data) internal pure returns (Order memory order) {
        require(data.length >= 256, "broken data");
        bytes32 tmp;
        assembly {
            // trader / 20
            mstore(add(order, 0), mload(add(data, 20)))
            // broker / 20
            mstore(add(order, 32), mload(add(data, 40)))
            // relayer / 20
            mstore(add(order, 64), mload(add(data, 60)))
            // referrer / 20
            mstore(add(order, 96), mload(add(data, 80)))
            // liquidityPool / 20
            mstore(add(order, 128), mload(add(data, 100)))
            // minTradeAmount / 32
            mstore(add(order, 160), mload(add(data, 132)))
            // amount / 32
            mstore(add(order, 192), mload(add(data, 164)))
            // limitPrice / 32
            mstore(add(order, 224), mload(add(data, 196)))
            // triggerPrice / 32
            mstore(add(order, 256), mload(add(data, 228)))
            // chainID / 32
            mstore(add(order, 288), mload(add(data, 260)))
            // expiredAt + perpetualIndex + brokerFeeLimit + flags + salt + v + signType / 26
            tmp := mload(add(data, 292))
        }
        order.expiredAt = uint64(bytes8(tmp));
        order.perpetualIndex = uint32(bytes4(tmp << 64));
        order.brokerFeeLimit = uint32(bytes4(tmp << 96));
        order.flags = uint32(bytes4(tmp << 128));
        order.salt = uint32(bytes4(tmp << 160));
    }
}
