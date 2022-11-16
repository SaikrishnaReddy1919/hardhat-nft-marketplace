//SPDX-License-Identifier: MIT

pragma solidity ^0.8.7;

import "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";

error NftMarkeplace__PriceMustBeAboveZero();
error NftMarkeplace__NotApprovedForMarketplace();
error NftMarkeplace__AlreadyListed(address nftAddress, uint256 tokenId);
error NftMarkeplace__NotAnOwner(address nftAddress, uint256 tokenId);
error NftMarkeplace__NotListed(address nftAddress, uint256 tokenId);
error NftMarketplace__PriceNotMet(address nftAddress, uint256 tokenId, uint256 price);

contract NftMarketplace is ReentrancyGuard {
    struct Listing {
        uint256 price;
        address seller;
    }
    event ItemListed(
        address indexed seller,
        address indexed nftAddress,
        uint256 indexed tokenId,
        uint256 price
    );
    event ItemBought(
        address indexed buyer,
        address indexed nftAddress,
        uint256 indexed tokenId,
        uint256 price
    );
    event ItemCanceled(address indexed seller, address indexed nftAddress, uint256 tokenId);

    //NFT contract address -> NFt TokenId -> Listing
    mapping(address => mapping(uint256 => Listing)) private s_listings;
    // seller address => amount earned
    mapping(address => uint256) private s_proceeds;

    modifier notListed(
        address nftAddress,
        uint256 tokenId,
        address owner
    ) {
        Listing memory listing = s_listings[nftAddress][tokenId];
        if (listing.price > 0) {
            revert NftMarkeplace__AlreadyListed(nftAddress, tokenId);
        }
        _;
    }

    modifier isListed(address nftAddress, uint256 tokenId) {
        Listing memory listing = s_listings[nftAddress][tokenId];
        if (listing.price <= 0) {
            revert NftMarkeplace__NotListed(nftAddress, tokenId);
        }
        _;
    }

    modifier isOwner(
        address nftAddress,
        uint256 tokenId,
        address spender
    ) {
        IERC721 nft = IERC721(nftAddress);
        if (nft.ownerOf(tokenId) != spender) {
            revert NftMarkeplace__NotAnOwner(nftAddress, tokenId);
        }
        _;
    }

    /**
     * Two ways :
     *  1. Send the NFT to the contract. -> transfer  -> contract 'hold' the NFT. (gas expensive than below and not the better one bcaz users cant be the owners anymore)
     *  2. Instead, Owners can still hold theier NFT, and give the marketplace approval to sell the NFT for them(*** better way ***)
     *
     * conditions to check before listing :
     * 1. Item must not be listed already (noListed - modifier)
     * 2. nft must be owner the user who is trying to list the nft
     * 3. price cant be  less than zero
     * 4. nft must be approved by the owner for listing in the marketplace
     */
    function listItem(
        address nftAddress,
        uint256 tokenId,
        uint256 price
    ) external notListed(nftAddress, tokenId, msg.sender) isOwner(nftAddress, tokenId, msg.sender) {
        if (price <= 0) {
            revert NftMarkeplace__PriceMustBeAboveZero();
        }

        IERC721 nft = IERC721(nftAddress);
        //check wether nft is approved for listing by marketplace or not.
        if (nft.getApproved(tokenId) != address(this)) {
            revert NftMarkeplace__NotApprovedForMarketplace();
        }

        s_listings[nftAddress][tokenId] = Listing(price, msg.sender);
        emit ItemListed(msg.sender, nftAddress, tokenId, price);
    }

    function buyItem(address nftAddress, uint256 tokenId)
        external
        payable
        nonReentrant
        isListed(nftAddress, tokenId)
    {
        /**
         * item must be listed.
         * price must be equal to listed price
         * increase the amount earned for nft owner. so that owner can withdraw later
         * delete the listing from marketplace
         * transfer
         */

        Listing memory listedItem = s_listings[nftAddress][tokenId];

        if (msg.value < listedItem.price) {
            revert NftMarketplace__PriceNotMet(nftAddress, tokenId, listedItem.price);
        }

        //we dont just send the seller the money...why?
        //check : https://fravoll.github.io/solidity-patterns/pull_over_push.html

        // sending the money to use user ? ❌
        // have them withdraw the money ✅

        // do state changes before calling external contract best practise
        s_proceeds[listedItem.seller] = s_proceeds[listedItem.seller] + msg.value;
        delete (s_listings[nftAddress][tokenId]);

        // call external contract
        IERC721(nftAddress).safeTransferFrom(listedItem.seller, msg.sender, tokenId);

        emit ItemBought(msg.sender, nftAddress, tokenId, listedItem.price);
    }

    function calcelListing(address nftAddress, uint256 tokenId)
        public
        isOwner(nftAddress, tokenId, msg.sender)
        isListed(nftAddress, tokenId)
    {
        delete (s_listings[nftAddress][tokenId]);
        emit ItemCanceled(msg.sender, nftAddress, tokenId);
    }

    function udpateListing(
        address nftAddress,
        uint256 tokenId,
        uint256 newPrice
    ) external isOwner(nftAddress, tokenId, msg.sender) isListed(nftAddress, tokenId) {
        if (newPrice <= 0) {
            revert NftMarkeplace__PriceMustBeAboveZero();
        }

        Listing memory listing = s_listings[nftAddress][tokenId];
        listing.price = newPrice;

        emit ItemListed(msg.sender, nftAddress, tokenId, newPrice);
    }
}
