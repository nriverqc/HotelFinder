/**
 * @fileoverview Unit tests for HotelFinder v2 Milestone Rewards & Loyalty Ledger.
 * Verifies:
 * - Integer cents accuracy
 * - Milestone ladder progress calculation ($3, $10, $25)
 * - Server-side atomic reward claims (claimRewardVoucher)
 * - Insufficient balance protection & FIFO lot deduction
 * - Idempotent booking credit confirmation
 */

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');

process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = 'error';

const TEST_DB = path.join(__dirname, '..', '..', 'data', 'test_loyalty.db');
process.env.DB_PATH = TEST_DB;

const db = require('../../data/database');

describe('HotelFinder v2: Milestone Rewards & Loyalty Ledger', () => {
  before(async () => {
    if (fs.existsSync(TEST_DB)) {
      try { fs.unlinkSync(TEST_DB); } catch {}
    }
    await db.initialize();
  });

  after(() => {
    db.close();
    if (fs.existsSync(TEST_DB)) {
      try { fs.unlinkSync(TEST_DB); } catch {}
    }
  });

  describe('Milestone Progression Ladder', () => {
    it('should correctly calculate progress toward Tier 1 ($3.00 USD / 300 cents)', () => {
      // User with $1.50 (150 cents) -> 50% of Tier 1 ($3.00)
      const prog = db.calculateMilestoneProgress(150);
      assert.equal(prog.availableCents, 150);
      assert.equal(prog.availableUsd, 1.50);
      assert.equal(prog.targetTier.amountUsd, 3.00);
      assert.equal(prog.progressPercent, 50);
      assert.equal(prog.remainingUsd, 1.50);
      assert.equal(prog.hasClaimableReward, false);
    });

    it('should indicate claimable reward when Tier 1 is reached ($3.00 USD)', () => {
      // User with $3.50 (350 cents) -> Tier 1 achieved!
      const prog = db.calculateMilestoneProgress(350);
      assert.equal(prog.hasClaimableReward, true);
      assert.equal(prog.claimableTiers.length, 1);
      assert.equal(prog.claimableTiers[0].amountUsd, 3.00);
    });

    it('should calculate progress toward Tier 2 ($10.00 USD) once Tier 1 is surpassed', () => {
      // User with $5.00 (500 cents) -> 50% of Tier 2 ($10.00)
      const prog = db.calculateMilestoneProgress(500);
      assert.equal(prog.targetTier.amountUsd, 10.00);
      assert.equal(prog.progressPercent, 50);
      assert.equal(prog.remainingUsd, 5.00);
    });
  });

  describe('Database Ledger & Server-Side Reward Claims', () => {
    let testUser;
    const testDevice = 'test_device_token_tier';

    it('should create user session and start with zero balance', async () => {
      testUser = await db.syncSession(testDevice);
      assert.ok(testUser.id > 0);

      const available = await db.getAvailableBalanceCents(testUser.id);
      assert.equal(available, 0);
    });

    it('should record pending booking and confirm stay via webhook', async () => {
      await db.recordPendingBookingCredit({
        deviceToken: testDevice,
        bookingSubid: 'subid_stay_1',
        commissionCents: 400, // $4.00 earned
      });

      // Confirm stay
      const res = await db.confirmBookingCredit({
        eventId: 'evt_stay_1',
        bookingSubid: 'subid_stay_1',
        newCommissionCents: 400,
      });

      assert.equal(res.duplicate, false);

      const available = await db.getAvailableBalanceCents(testUser.id);
      assert.equal(available, 400); // $4.00 USD confirmed
    });

    it('should reject reward claim if user requests higher tier than balance', async () => {
      await assert.rejects(
        async () => {
          // User has $4.00, attempts to claim Tier 2 ($10.00 = 1000 cents)
          await db.claimRewardVoucher({
            deviceToken: testDevice,
            email: 'viajero@gmail.com',
            tierCents: 1000,
          });
        },
        /Saldo insuficiente/
      );
    });

    it('should reject reward claim with invalid email', async () => {
      await assert.rejects(
        async () => {
          await db.claimRewardVoucher({
            deviceToken: testDevice,
            email: 'invalid-email',
            tierCents: 300,
          });
        },
        /correo electrónico válido/
      );
    });

    it('should successfully execute Tier 1 claim ($3.00), deduct balance via FIFO, and register claim', async () => {
      const claimResult = await db.claimRewardVoucher({
        deviceToken: testDevice,
        email: 'viajero@gmail.com',
        tierCents: 300, // $3.00 USD
      });

      assert.equal(claimResult.success, true);
      assert.equal(claimResult.tierAmountUsd, 3.00);
      assert.equal(claimResult.status, 'PENDING_FULFILLMENT');

      // Balance was $4.00, deducted $3.00 -> remaining should be $1.00 (100 cents)
      const remainingBalance = await db.getAvailableBalanceCents(testUser.id);
      assert.equal(remainingBalance, 100);

      // Account overview should reflect the claim
      const account = await db.getUserAccount(testDevice);
      assert.equal(account.claims.length, 1);
      assert.equal(account.claims[0].tier_amount_usd, 3.00);
      assert.equal(account.claims[0].status, 'PENDING_FULFILLMENT');
    });
  });
});
