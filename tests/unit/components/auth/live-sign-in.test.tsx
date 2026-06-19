// @vitest-environment jsdom

/**
 * <LiveSignIn> - the passwordless multi-provider flow.
 *
 * Pins the three branches that matter for "one email = one auth method":
 *   1. The Google button kicks off Supabase OAuth.
 *   2. An email whose lookup returns `otp` sends a code and advances to the
 *      code-entry step.
 *   3. An email whose lookup returns `oauth` is steered to that provider
 *      (we never email an OTP to an OAuth account).
 *   4. Verifying a code routes to /auth/callback (the shared bootstrap).
 *
 * Network + Supabase are fully mocked; CAPTCHA is off so no Turnstile script
 * loads in jsdom.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

const replaceMock = vi.fn();
const signInWithOAuthMock = vi.fn();
const signInWithOtpMock = vi.fn();
const verifyOtpMock = vi.fn();
const identityLookupMock = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: replaceMock, push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(""),
}));

vi.mock("@/lib/config", () => ({
  config: {
    isMock: false,
    captchaEnabled: false,
    turnstileSiteKey: "",
    enterpriseSsoEnabled: false,
    supabase: { url: "x", anonKey: "y", isConfigured: () => true },
  },
}));

vi.mock("@/lib/supabase/browser", () => ({
  getBrowserSupabase: () => ({
    auth: {
      signInWithOAuth: (...a: unknown[]) => signInWithOAuthMock(...a),
      signInWithOtp: (...a: unknown[]) => signInWithOtpMock(...a),
      verifyOtp: (...a: unknown[]) => verifyOtpMock(...a),
    },
  }),
}));

vi.mock("@/lib/api/client", () => ({
  api: { auth: { identityLookup: (...a: unknown[]) => identityLookupMock(...a) } },
  ApiError: class ApiError extends Error {
    code: string;
    constructor(code = "internal", message = "") {
      super(message);
      this.code = code;
    }
  },
}));

import { LiveSignIn } from "@/components/auth/live-sign-in";

function typeEmail(value: string) {
  fireEvent.change(screen.getByPlaceholderText("you@company.com"), {
    target: { value },
  });
}

describe("<LiveSignIn>", () => {
  beforeEach(() => {
    replaceMock.mockReset();
    signInWithOAuthMock.mockReset().mockResolvedValue({ error: null });
    signInWithOtpMock.mockReset().mockResolvedValue({ error: null });
    verifyOtpMock.mockReset().mockResolvedValue({ error: null });
    identityLookupMock.mockReset();
  });

  afterEach(() => cleanup());

  it("Continue with Google starts Supabase OAuth", async () => {
    render(<LiveSignIn mode="login" returnTo="/dashboard" />);
    fireEvent.click(screen.getByRole("button", { name: /continue with google/i }));
    await waitFor(() =>
      expect(signInWithOAuthMock).toHaveBeenCalledWith(
        expect.objectContaining({ provider: "google" }),
      ),
    );
  });

  it("an OTP email sends a code and advances to the code step", async () => {
    identityLookupMock.mockResolvedValue({ method: "otp", provider: null });
    render(<LiveSignIn mode="login" returnTo="/dashboard" />);
    typeEmail("new@example.com");
    fireEvent.click(screen.getByRole("button", { name: /continue with email/i }));

    await waitFor(() => expect(signInWithOtpMock).toHaveBeenCalledTimes(1));
    expect(signInWithOtpMock).toHaveBeenCalledWith(
      expect.objectContaining({ email: "new@example.com" }),
    );
    // Code-entry step is now showing.
    await waitFor(() => expect(screen.queryByText(/check your email/i)).not.toBeNull());
    expect(screen.queryByPlaceholderText("123456")).not.toBeNull();
  });

  it("an OAuth-linked email is steered to its provider (no OTP sent)", async () => {
    identityLookupMock.mockResolvedValue({ method: "oauth", provider: "google" });
    render(<LiveSignIn mode="login" returnTo="/dashboard" />);
    typeEmail("existing@gmail.com");
    fireEvent.click(screen.getByRole("button", { name: /continue with email/i }));

    await waitFor(() =>
      expect(signInWithOAuthMock).toHaveBeenCalledWith(
        expect.objectContaining({ provider: "google" }),
      ),
    );
    expect(signInWithOtpMock).not.toHaveBeenCalled();
  });

  it("verifying a code routes to /auth/callback", async () => {
    identityLookupMock.mockResolvedValue({ method: "otp", provider: null });
    render(<LiveSignIn mode="login" returnTo="/work" />);
    typeEmail("new@example.com");
    fireEvent.click(screen.getByRole("button", { name: /continue with email/i }));
    await waitFor(() => expect(screen.queryByPlaceholderText("123456")).not.toBeNull());

    fireEvent.change(screen.getByPlaceholderText("123456"), { target: { value: "123456" } });
    fireEvent.click(screen.getByRole("button", { name: /verify and continue/i }));

    await waitFor(() => expect(verifyOtpMock).toHaveBeenCalledTimes(1));
    expect(verifyOtpMock).toHaveBeenCalledWith(
      expect.objectContaining({ token: "123456", type: "email" }),
    );
    expect(replaceMock).toHaveBeenCalledWith(expect.stringContaining("/auth/callback"));
  });
});
