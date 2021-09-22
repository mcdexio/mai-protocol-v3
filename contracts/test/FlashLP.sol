// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.7.4;

contract FlashLP {
    function approve(address token, address to) external {
        (bool success, ) = token.call(
            abi.encodeWithSignature("approve(address,uint256)", to, type(uint256).max)
        );
        require(success);
    }

    function act1(address liquidityPool, uint256 amount) external {
        {
            (bool success, bytes memory reason) = liquidityPool.call(
                abi.encodeWithSignature("addLiquidity(int256)", amount, type(uint256).max)
            );
            require(success, string(reason));
        }
        {
            (bool success, bytes memory reason) = liquidityPool.call(
                abi.encodeWithSignature("removeLiquidity(int256,int256)", amount, 0)
            );
            require(success, string(reason));
        }
    }

    function withdraw(address token, uint256 amount) external {
        (bool success, ) = token.call(
            abi.encodeWithSignature("transfer(address,uint256)", msg.sender, amount)
        );
        require(success);
    }
}
