/**
 * payments.routes.js — customer-facing deployment payment endpoints.
 *
 *   GET  /api/payments/orders/:orderId        → order + receipt status (owner only)
 *   POST /api/payments/manual-receipts         → upload a bank-transfer receipt
 *   POST /api/payments/paypal/orders           → create a PayPal order for a deployment
 *   POST /api/payments/paypal/orders/:id/capture → capture + mark paid
 *
 * Manual receipts are written to the Render persistent disk under
 * DATA_DIR/receipts/{userId}/{checkoutOrderId}/ and must be approved by an admin.
 */
import express from 'express';
import multer from 'multer';
import { mkdirSync } from 'node:fs';
import { join, resolve, extname } from 'node:path';
import authMiddleware from '../middleware/authMiddleware.js';
import { prisma } from '../services/db.js';
import { writeAuditLog } from '../services/auditLogService.js';
import { updateDeploymentRecord } from '../glondia-engines/00-SHARED/deploymentRecordStore.js';
import { findDeploymentRecord, createDeploymentRenewalOrder } from '../services/deploymentBillingService.js';
import { readHostingStore } from '../services/hostingStore.js';
import { deploymentBilling, billingTiers, graceHours, initialRenderPlan, getBillingTier } from '../config/deploymentBilling.js';
import { getPromoUsage, getUserPromoStatus, resolveRequestedBillingTier } from '../services/deploymentPromoService.js';
import { createUserNotification, createAdminNotification } from '../services/notificationService.js';
import {
  createDeploymentPaypalOrder,
  captureDeploymentPaypalOrder,
} from '../services/deploymentPaypalService.js';

const router = express.Router();

const dataDir = resolve(process.env.DATA_DIR || join(process.cwd(), '.glondia-data'));
const RECEIPTS_ROOT = join(dataDir, 'receipts');
const MAX_RECEIPT_BYTES = Number(process.env.RECEIPT_UPLOAD_MAX_BYTES || 10 * 1024 * 1024);
const ALLOWED_EXT = new Set(['.pdf', '.png', '.jpg', '.jpeg']);
const ALLOWED_MIME = new Set([
  'application/pdf', 'image/png', 'image/jpeg', 'image/jpg', 'application/octet-stream',
]);

function safeSegment(value, fallback) {
  const clean = String(value || '').replace(/[^a-zA-Z0-9_-]/g, '');
  return clean || fallback;
}

const storage = multer.diskStorage({
  destination(req, _file, cb) {
    const userSeg = safeSegment(req.user?.id, 'anonymous');
    const orderSeg = safeSegment(req.body?.checkoutOrderId || req.body?.orderId, 'unassigned');
    const dir = join(RECEIPTS_ROOT, userSeg, orderSeg);
    try {
      mkdirSync(dir, { recursive: true });
      cb(null, dir);
    } catch (err) {
      cb(err);
    }
  },
  filename(_req, file, cb) {
    const ext = extname(file.originalname || '').toLowerCase() || '.bin';
    cb(null, `receipt-${Date.now()}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: MAX_RECEIPT_BYTES, files: 1 },
  fileFilter(_req, file, cb) {
    const ext = extname(file.originalname || '').toLowerCase();
    const mime = String(file.mimetype || '').toLowerCase();
    if (ALLOWED_EXT.has(ext) && (ALLOWED_MIME.has(mime) || mime.startsWith('image/'))) {
      return cb(null, true);
    }
    const err = new Error('Only PDF, PNG, JPG or JPEG receipts are accepted.');
    err.status = 400;
    err.code = 'RECEIPT_INVALID_TYPE';
    err.expose = true;
    return cb(err);
  },
});

router.use(authMiddleware);

// ── Launch pricing + promo availability (for the deploy tier selector) ───────
router.get('/pricing', async (req, res, next) => {
  try {
    const [promo, userPromo] = await Promise.all([
      getPromoUsage(),
      getUserPromoStatus(req.user?.id),
    ]);
    const tiers = Object.values(billingTiers).map((t) => ({
      id: t.id,
      label: t.label,
      amount: t.amount,
      amountCents: t.amountCents,
      currency: t.currency,
      displayAmount: `K${t.amount}`,
      promo: t.promo === true,
      renderPlanAfterPayment: t.renderPlanAfterPayment,
      // The promo tier is selectable only when THIS user can still claim it.
      available: t.promo ? userPromo.canClaim : true,
    }));
    res.json({
      data: {
        tiers,
        graceHours,
        initialRenderPlan,
        // Global stats (admin/analytics) + this user's promo eligibility.
        promo: { limit: promo.limit, used: promo.used, remaining: promo.remaining, available: promo.available },
        userPromo,
      },
      requestId: req.id,
    });
  } catch (error) { next(error); }
});

// ── Per-user billing summary (promo + pricing + orders + deployments) ────────
router.get('/billing-summary', async (req, res, next) => {
  try {
    const userId = req.user?.id;
    const isAdmin = req.user?.role === 'admin';
    const promo = await getUserPromoStatus(userId);

    // Normal users see only their own orders/deployments; admins see all.
    const orderWhere = isAdmin
      ? { type: 'deployment' }
      : { type: 'deployment', userId: userId && userId !== 'local-user' ? userId : '__none__' };
    const orders = await prisma.checkoutOrder.findMany({
      where: orderWhere,
      orderBy: { createdAt: 'desc' },
      take: 200,
      include: { receipts: { orderBy: { createdAt: 'desc' }, take: 1 } },
    });

    const store = await readHostingStore();
    const deployments = (store.deployments || [])
      .filter((d) => isAdmin || d.userId === userId)
      .map((d) => ({
        deploymentId: d.deploymentId,
        serviceName: d.serviceName || null,
        status: d.status || null,
        paymentStatus: d.paymentStatus || 'none',
        billingTierId: d.billingTierId || null,
        billingTierLabel: d.billingTierLabel || null,
        promoApplied: d.promoApplied === true,
        promoClaimStatus: d.promoClaimStatus || null,
        priceCents: d.priceCents ?? null,
        priceCurrency: d.priceCurrency || null,
        checkoutOrderId: d.checkoutOrderId || null,
        billingDueAt: d.billingDueAt || null,
        trialStartedAt: d.trialStartedAt || null,
        trialEndsAt: d.trialEndsAt || d.billingDueAt || null,
        subscriptionStatus: d.subscriptionStatus || null,
        currentPeriodStart: d.currentPeriodStart || null,
        currentPeriodEnd: d.currentPeriodEnd || null,
        nextBillingAt: d.nextBillingAt || null,
        renewalReminderAt: d.renewalReminderAt || null,
        lastPaidAt: d.lastPaidAt || null,
        renewalCount: d.renewalCount ?? null,
        paidAt: d.paidAt || null,
        renderPlan: d.renderPlan || null,
        liveUrl: d.liveUrl || null,
      }));

    const promoTier = getBillingTier('promo_50');
    const standardTier = getBillingTier('standard_200');

    res.json({
      data: {
        promo,
        pricing: {
          promo: { amount: promoTier.amount, currency: promoTier.currency, displayAmount: `K${promoTier.amount}` },
          standard: { amount: standardTier.amount, currency: standardTier.currency, displayAmount: `K${standardTier.amount}` },
        },
        graceHours,
        initialRenderPlan,
        orders,
        deployments,
      },
      requestId: req.id,
    });
  } catch (error) { next(error); }
});

// ── Apply/change the billing tier on a pending deployment order ───────────────
// Lets a user deploy first, then choose K50/K200 in billing. Eligibility is
// re-verified server-side; the frontend is never trusted.
router.post('/deployments/:deploymentId/renew', async (req, res, next) => {
  try {
    const result = await createDeploymentRenewalOrder({
      deploymentId: req.params.deploymentId,
      user: req.user,
      billingTierId: req.body?.billingTierId || null,
    });
    res.status(201).json({ data: result, requestId: req.id });
  } catch (error) { next(error); }
});

router.post('/deployment-orders/:orderId/apply-tier', async (req, res, next) => {
  try {
    const requestedTierId = String(req.body?.billingTierId || '').trim();
    if (!['promo_50', 'standard_200'].includes(requestedTierId)) {
      return res.status(400).json({ success: false, error: { code: 'INVALID_TIER', message: 'billingTierId must be promo_50 or standard_200.' }, requestId: req.id });
    }

    const order = await prisma.checkoutOrder.findUnique({ where: { id: req.params.orderId } });
    if (!order || order.type !== 'deployment') {
      return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Deployment order not found.' }, requestId: req.id });
    }
    const isAdmin = req.user?.role === 'admin';
    if (!isAdmin && order.userId && order.userId !== req.user?.id) {
      return res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'This order belongs to another account.' }, requestId: req.id });
    }
    if (order.status !== 'pending') {
      return res.status(409).json({ success: false, error: { code: 'ORDER_NOT_PENDING', message: `Only pending orders can change tier (current: ${order.status}).` }, requestId: req.id });
    }

    const ownerId = order.userId || req.user?.id;
    const { tier, promoApplied, promoStatus, switched, message, promoWillBeMarkedUsedOnPayment } =
      await resolveRequestedBillingTier({ userId: ownerId, requestedTierId, deploymentId: order.deploymentId });

    const meta = (() => { try { return JSON.parse(order.metadata || '{}'); } catch { return {}; } })();
    await prisma.checkoutOrder.update({
      where: { id: order.id },
      data: {
        currency: tier.currency,
        actualAmountCents: tier.amountCents,
        totalAmountCents: tier.amountCents,
        metadata: JSON.stringify({
          ...meta,
          billingTierId: tier.id,
          billingTierLabel: tier.label,
          promoApplied,
          promoClaimForUserId: promoApplied ? (order.userId || null) : null,
          promoWillBeMarkedUsedOnPayment: promoWillBeMarkedUsedOnPayment === true,
          renderPlanAfterPayment: tier.renderPlanAfterPayment,
          display: { amount: tier.amount, currency: tier.currency },
        }),
      },
    });

    if (order.deploymentId) {
      const deployment = await findDeploymentRecord(order.deploymentId);
      if (deployment) {
        await updateDeploymentRecord(order.deploymentId, {
          billingTierId: tier.id,
          billingTierLabel: tier.label,
          promoApplied,
          promoClaimStatus: promoApplied ? 'pending' : (promoStatus?.used ? 'used' : (promoStatus?.eligible ? 'not_applicable' : 'unavailable')),
          priceCents: tier.amountCents,
          priceCurrency: tier.currency,
          renderPlanTargetAfterPayment: tier.renderPlanAfterPayment,
        });
      }
    }

    await writeAuditLog({
      organizationId: order.organizationId,
      actorUserId: req.user?.id !== 'local-user' ? req.user?.id : null,
      action: 'deployment.billing.tier_applied',
      entityType: 'checkout_order',
      entityId: order.id,
      result: { requestedTierId, appliedTierId: tier.id, promoApplied, switched },
    });

    res.json({
      data: {
        orderId: order.id,
        billingTierId: tier.id,
        billingTierLabel: tier.label,
        amount: tier.amount,
        amountCents: tier.amountCents,
        currency: tier.currency,
        displayAmount: `K${tier.amount}`,
        promoApplied,
        switched,
        message,
        promo: promoStatus,
      },
      requestId: req.id,
    });
  } catch (error) { next(error); }
});

// ── Order status (owner only) ────────────────────────────────────────────────
router.get('/orders/:orderId', async (req, res, next) => {
  try {
    const order = await prisma.checkoutOrder.findUnique({
      where: { id: req.params.orderId },
      include: { receipts: { orderBy: { createdAt: 'desc' } } },
    });
    if (!order) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Order not found.' }, requestId: req.id });
    if (req.user?.role !== 'admin' && order.userId && order.userId !== req.user?.id) {
      return res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'This order belongs to another account.' }, requestId: req.id });
    }
    res.json({ data: order, requestId: req.id });
  } catch (error) { next(error); }
});

// ── Manual bank receipt upload ───────────────────────────────────────────────
router.post('/manual-receipts', upload.single('receipt'), async (req, res, next) => {
  try {
    const checkoutOrderId = req.body?.checkoutOrderId || req.body?.orderId;
    if (!checkoutOrderId) {
      return res.status(400).json({ success: false, error: { code: 'ORDER_REQUIRED', message: 'checkoutOrderId is required.' }, requestId: req.id });
    }
    if (!req.file) {
      return res.status(400).json({ success: false, error: { code: 'RECEIPT_REQUIRED', message: 'A receipt file is required.' }, requestId: req.id });
    }

    const order = await prisma.checkoutOrder.findUnique({ where: { id: checkoutOrderId } });
    if (!order) {
      return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Order not found.' }, requestId: req.id });
    }
    // Ownership: a user may only upload receipts against their own order.
    if (req.user?.role !== 'admin' && order.userId && order.userId !== req.user?.id) {
      return res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'This order belongs to another account.' }, requestId: req.id });
    }

    const receipt = await prisma.paymentReceipt.create({
      data: {
        checkoutOrderId: order.id,
        userId: order.userId || (req.user?.id !== 'local-user' ? req.user?.id : null),
        deploymentId: order.deploymentId || null,
        method: 'bank_transfer',
        fileName: req.file.originalname,
        filePath: req.file.path,
        fileType: req.file.mimetype || null,
        fileSize: req.file.size || 0,
        amountCents: order.totalAmountCents || deploymentBilling.amountCents,
        currency: order.currency || deploymentBilling.currency,
        status: 'pending',
        note: req.body?.note ? String(req.body.note).slice(0, 1000) : null,
      },
    });

    // Order → payment_uploaded; deployment → payment_uploaded.
    await prisma.checkoutOrder.update({ where: { id: order.id }, data: { status: 'payment_uploaded' } });
    if (order.deploymentId) {
      const deployment = await findDeploymentRecord(order.deploymentId);
      if (deployment) {
        await updateDeploymentRecord(order.deploymentId, { paymentStatus: 'payment_uploaded' });
      }
    }

    await writeAuditLog({
      organizationId: order.organizationId,
      actorUserId: req.user?.id !== 'local-user' ? req.user?.id : null,
      action: 'payment.receipt.uploaded',
      entityType: 'payment_receipt',
      entityId: receipt.id,
      result: { checkoutOrderId: order.id, deploymentId: order.deploymentId, fileSize: receipt.fileSize },
    });

    // Notify the customer (uploaded) and admins (needs review).
    await createUserNotification(order.userId || req.user?.id, {
      type: 'receipt',
      title: 'Receipt uploaded',
      message: 'Your receipt has been uploaded and is waiting for admin verification.',
      actionUrl: '/dashboard/billing',
      entityType: 'receipt',
      entityId: receipt.id,
    });
    await createAdminNotification({
      type: 'receipt',
      title: 'New bank receipt needs review',
      message: 'A customer uploaded a bank receipt for hosting payment.',
      actionUrl: '/admin',
      entityType: 'receipt',
      entityId: receipt.id,
    });

    res.status(201).json({
      data: {
        receiptId: receipt.id,
        status: receipt.status,
        checkoutOrderId: order.id,
        deploymentId: order.deploymentId,
        message: 'Receipt uploaded. An administrator will review and approve it.',
      },
      requestId: req.id,
    });
  } catch (error) { next(error); }
});

// ── PayPal (card via PayPal) deployment payment ──────────────────────────────
router.post('/paypal/orders', async (req, res, next) => {
  try {
    const result = await createDeploymentPaypalOrder({
      checkoutOrderId: req.body?.checkoutOrderId || req.body?.orderId,
      user: req.user,
    });
    res.json({ data: result, requestId: req.id });
  } catch (error) { next(error); }
});

router.post('/paypal/orders/:paypalOrderId/capture', async (req, res, next) => {
  try {
    const result = await captureDeploymentPaypalOrder({
      paypalOrderId: req.params.paypalOrderId,
      user: req.user,
    });
    res.json({ data: result, requestId: req.id });
  } catch (error) { next(error); }
});

export default router;
