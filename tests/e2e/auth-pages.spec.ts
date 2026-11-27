import { expect, test } from '@playwright/test';

test.describe('Auth pages', () => {
  test('home header offers Sign in and the guest dashboard still renders', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('link', { name: 'Sign in' }).first()).toBeVisible();
    await expect(page.getByText('No tournaments yet')).toBeVisible();
  });

  test('sign-in form renders', async ({ page }) => {
    await page.goto('/auth/sign-in');
    await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
    await expect(page.getByLabel('Email')).toBeVisible();
    await expect(page.getByLabel('Password')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Sign in' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Forgot password?' })).toBeVisible();
  });

  test('sign-up form renders', async ({ page }) => {
    await page.goto('/auth/sign-up');
    await expect(page.getByRole('heading', { name: 'Create account' })).toBeVisible();
    await expect(page.getByLabel('Name')).toBeVisible();
    await expect(page.getByLabel('Email')).toBeVisible();
    await expect(page.getByLabel('Password')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Create account' })).toBeVisible();
  });

  test('verify-email form renders a 6-digit code field', async ({ page }) => {
    await page.goto('/auth/verify-email');
    await expect(page.getByRole('heading', { name: 'Verify email' })).toBeVisible();
    await expect(page.getByLabel('6-digit code')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Resend code' })).toBeVisible();
  });

  test('forgot-password form renders', async ({ page }) => {
    await page.goto('/auth/forgot-password');
    await expect(page.getByRole('heading', { name: 'Forgot password' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Send reset code' })).toBeVisible();
  });

  test('reset-password form renders', async ({ page }) => {
    await page.goto('/auth/reset-password');
    await expect(page.getByRole('heading', { name: 'Reset password' })).toBeVisible();
    await expect(page.getByLabel('New password')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Reset password' })).toBeVisible();
  });

  test('signed-out /account redirects to sign-in', async ({ page }) => {
    await page.goto('/account');
    await expect(page).toHaveURL(/\/auth\/sign-in/);
    await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
  });
});
