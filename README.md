# SPENDNOT

A personal expense tracker for iOS & Android — built with Expo SDK 56 + Firebase.

## Dev Server

```bash
# Must use Node 22 (Expo SDK 56 requires it)
nvm use 22
npm start        # starts Metro on http://localhost:8081
```

> **Why `EXPO_USE_FAST_RESOLVER=1`?** — Expo SDK 56 ships TypeScript source as `main` entries in some packages. Node 22's native TS stripping rejects these during the config-plugin phase. `EXPO_USE_FAST_RESOLVER=1` bypasses that phase cleanly.

## Firebase Setup ✅

| Step | Status |
|------|--------|
| Firebase project `spendnot-app` | ✅ Created |
| Firestore database (asia-south1) | ✅ Created |
| Firestore security rules | ✅ Deployed |
| Firestore indexes | ✅ Deployed |
| Firebase web app + SDK config | ✅ Wired in `lib/firebase.ts` |
| Email/Password auth | ⚠️ **Enable manually** (see below) |
| Apple Sign-In | ⚠️ Needs Apple Developer entitlement |

### Enable Email/Password Auth (required!)

1. Open → https://console.firebase.google.com/project/spendnot-app/authentication/providers
2. Click **Email/Password** → toggle **Enable** → Save

That's the only remaining Firebase setup step.

## App Structure

```
app/
  _layout.tsx           Root layout — fonts, auth guard, navigation
  (auth)/
    login.tsx           Email/Password + Apple Sign-In
    register.tsx        Create account → Firestore user doc
  onboarding.tsx        First wallet setup
  (tabs)/
    index.tsx           Dashboard — wallets, summary, recent expenses
    wallets.tsx         Wallet cards + per-wallet spend
    budgets.tsx         Budget progress + Recurring (Mark as Paid)
    reports.tsx         Line chart + category breakdown + CSV export
    profile.tsx         Settings, sign out, clear data
  modals/
    add-expense.tsx     Log expense/income
    add-wallet.tsx      Add wallet

constants/theme.ts      Design system tokens
context/AuthContext.tsx Firebase auth state
hooks/                  Firestore real-time hooks
lib/firebase.ts         Firebase app init
lib/export.ts           Excel export (xlsx + expo-sharing)
types/models.ts         TypeScript data models
```

## Design System

| Token | Value |
|-------|-------|
| Canvas Ice | `#f2f2f2` |
| Carbon Black | `#000000` |
| Power Pink | `#fa00ff` |
| Sky Blue | `#02bbff` |
| Lime Pop | `#adff02` |
| Heading font | Montserrat Black 900 |
| Body font | Inter 400/500/700 |

No shadows. No gradients. Pill buttons. Pure contrast.
