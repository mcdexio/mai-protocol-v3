# mai-protocol-v3

> Mai Protocol V3 designed by MCDEX is an AMM-based decentralized perpetual swap protocol. Perpetual swap is one of the most popular derivatives that has no expiration date, supports margin trading, and has its price soft pegged to index price.
>
> The name Mai comes from two Chinese characters "买" which means buy and "卖" which means sell. Using pinyin (the modern system for transliterating Chinese characters to Latin letters) "买" is spelled Mǎi and "卖" is spelled Mài. Thus, "Mai" means "Buy" and "Sell".

**If not specified in advance, we always use decimals 18 as default in the code and documents.**

## Overview

[Overview](./contracts/Readme.md) of mai-protocol-v3.

## Reference

[Terms](./docs/term.md)

[References](https://mcdex.io/references/)

[AMMDesign](https://mcdexio.github.io/documents/en/Shared-Liquidity-AMM-of-MAI-PROTOCOL-v3.pdf)

[Deployed contracts](https://docs.mcdex.io/deployed-contracts)

## Audit

The smart contracts were audited by quantstamp:

- [Audit1: MCDEX Audit Report](./docs/asset/audit1-Quantstamp-MCDEX.pdf).
- [Audit2: MCDEX Audit Report](./docs/asset/audit2-Quantstamp-MCDEX-Arbitrum-Integration-Report.pdf).

## Development

### Compile contracts

```
npm install
npx hardhat compile
npx hardhat run scripts/s10test.ts
```
