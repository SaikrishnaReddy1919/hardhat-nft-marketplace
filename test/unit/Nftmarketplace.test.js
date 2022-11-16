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
      })
