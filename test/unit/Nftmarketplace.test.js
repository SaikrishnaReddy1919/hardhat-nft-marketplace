const { assert, expect } = require("chai")
const { network, ethers, deployments, getNamedAccounts } = require("hardhat")
const { developmentChains } = require("../../helper-hardhat-config")

!developmentChains.includes(network.name)
    ? describe.skip
    : describe("Nft marketplace tests", function () {
          let nftMarketplaceContract,
              nftMarketplace,
              nftMarketplacePlayer,
              basicNftContract,
              basicNft,
              basicNftPlayer,
              deployer,
              player

          const PRICE = ethers.utils.parseEther("0.1")
          const LESS_PRICE = ethers.utils.parseEther("0.01")
          const NEW_PRICE = ethers.utils.parseEther("0.5")

          const TOKEN_ID = 0
          const ZERO_ADDRESS = ethers.constants.AddressZero

          beforeEach(async function () {
              accounts = await ethers.getSigners() // could also do with getNamedAccounts
              deployer = accounts[0]
              player = accounts[1]

              await deployments.fixture(["all"])
              nftMarketplaceContract = await ethers.getContract("NftMarketplace")
              nftMarketplace = await nftMarketplaceContract.connect(deployer)
              nftMarketplacePlayer = await nftMarketplaceContract.connect(player)

              basicNftContract = await ethers.getContract("BasicNft") //automatically connects to deployer as deployer is the default one.
              basicNft = await basicNftContract.connect(deployer)
              basicNftPlayer = await basicNftContract.connect(player)

              await basicNft.mintNft()
              await basicNft.approve(nftMarketplace.address, TOKEN_ID)
          })

          describe("List Item", function () {
              it("nft (tokenId = 0) must not be listed before", async function () {
                  const listing = await nftMarketplace.getListing(
                      basicNftContract.address,
                      TOKEN_ID
                  )
                  assert.equal(listing.price.toString(), "0")
                  assert.equal(listing.seller.toString(), ZERO_ADDRESS)
              })
              it("should fail if the person listing is not the owner of the nft", async function () {
                  const error = `NftMarkeplace__NotAnOwner("${basicNft.address}", ${TOKEN_ID})`
                  await expect(
                      nftMarketplacePlayer.listItem(basicNftContract.address, TOKEN_ID, PRICE)
                  ).to.be.revertedWith(error)
              })
              it("3 should fail if the price is 0", async function () {
                  await expect(
                      nftMarketplace.listItem(basicNftContract.address, TOKEN_ID, 0)
                  ).to.be.revertedWith("NftMarkeplace__PriceMustBeAboveZero")
              })
              it("should fail if marketplace contract not approved before listing", async function () {
                  await basicNft.approve(ethers.constants.AddressZero, TOKEN_ID)
                  await expect(
                      nftMarketplace.listItem(basicNftContract.address, TOKEN_ID, PRICE)
                  ).to.be.revertedWith("NftMarkeplace__NotApprovedForMarketplace")
              })

              it("should list item in markeplace and update listings, emits an event", async function () {
                  await basicNft.approve(nftMarketplaceContract.address, TOKEN_ID)
                  expect(
                      await nftMarketplace.listItem(basicNftContract.address, TOKEN_ID, PRICE)
                  ).to.emit("ItemListed")

                  const listing = await nftMarketplace.getListing(
                      basicNftContract.address,
                      TOKEN_ID
                  )
                  assert.equal(listing.price.toString(), PRICE)
                  assert.equal(listing.seller.toString(), deployer.address)
              })
          })

          describe("Buy Item", function () {
              it("should fail if the item is not listed", async function () {
                  const error = `NftMarkeplace__NotListed("${basicNftContract.address}", ${TOKEN_ID})`
                  expect(
                      nftMarketplacePlayer.buyItem(basicNftContract.address, TOKEN_ID, PRICE)
                  ).to.be.revertedWith(error)
              })

              it("should fail if the price is less than the listed price", async function () {
                  const error = `NftMarketplace__PriceNotMet("${basicNftContract.address}", ${TOKEN_ID}, ${PRICE})`
                  await nftMarketplace.listItem(basicNftContract.address, TOKEN_ID, PRICE)

                  //player tries to buy item by passing price less than the listed price - should fail
                  expect(
                      nftMarketplacePlayer.buyItem(basicNftContract.address, TOKEN_ID, {
                          value: LESS_PRICE,
                      })
                  ).to.be.revertedWith(error)
              })

              it("should update the proceeds of seller once the item is bought", async function () {
                  //seller(deployer) lists the item
                  await nftMarketplace.listItem(basicNftContract.address, TOKEN_ID, PRICE)
                  //player buys the item
                  expect(
                      await nftMarketplacePlayer.buyItem(basicNftContract.address, TOKEN_ID, {
                          value: PRICE,
                      })
                  ).to.emit("ItemBought")
                  //deployer is the seller here, so his proceeds must be equal to price once the player buys the item listed by deployer
                  const proceeds = await nftMarketplace.getProceeds(deployer.address)

                  assert.equal(proceeds.toString(), PRICE.toString())
              })

              it("should transfer nft to player and delete the listing from listings", async function () {
                  //owner(deployer) lists the item
                  await nftMarketplace.listItem(basicNftContract.address, TOKEN_ID, PRICE)
                  //player buys the item
                  expect(
                      await nftMarketplacePlayer.buyItem(basicNftContract.address, TOKEN_ID, {
                          value: PRICE,
                      })
                  ).to.emit("ItemBought")
                  //check new owner - must be player
                  const newOwner = await basicNft.ownerOf(TOKEN_ID)
                  const listing = await nftMarketplace.getListing(
                      basicNftContract.address,
                      TOKEN_ID
                  )

                  assert.equal(newOwner, player.address)
                  assert.equal(listing.price.toString(), "0")
                  assert.equal(listing.seller.toString(), ZERO_ADDRESS)
              })
          })

          describe("updates listing", function () {
              beforeEach(async function () {
                  //deployer(owner) lists the item
                  await nftMarketplace.listItem(basicNftContract.address, TOKEN_ID, PRICE)
              })
              it("should fail if the person tries to update the price is not the owner", async function () {
                  const error = `NftMarkeplace__NotAnOwner("${basicNft.address}", ${TOKEN_ID})`
                  await expect(
                      //now player is trying to update the price-should revert
                      nftMarketplacePlayer.udpateListing(
                          basicNftContract.address,
                          TOKEN_ID,
                          NEW_PRICE
                      )
                  ).to.be.revertedWith(error)
              })
              it("should fail if the new price is 0", async function () {
                  await expect(
                      //now player is trying to update the price-should revert
                      nftMarketplace.udpateListing(basicNftContract.address, TOKEN_ID, 0)
                  ).to.be.revertedWith("NftMarkeplace__PriceMustBeAboveZero")
              })

              it("aaa should update the listings item with new price and emit event", async function () {
                  expect(
                      await nftMarketplace.udpateListing(
                          basicNftContract.address,
                          TOKEN_ID,
                          NEW_PRICE
                      )
                  ).to.emit("ItemListed")

                  const listing = await nftMarketplace.getListing(
                      basicNftContract.address,
                      TOKEN_ID
                  )

                  assert.equal(listing.price.toString(), NEW_PRICE.toString())
              })
          })
      })
