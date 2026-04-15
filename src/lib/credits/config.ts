/**
 * Credit configuration
 * Used by AI support agent for pricing info
 */

export const creditsConfig = {
  packages: [
    { name: "Starter", credits: 100, price: 199 },
    { name: "Standard", credits: 300, price: 499 },
    { name: "Pro", credits: 800, price: 999 },
  ],
  signupBonus: 20,
  referralReward: 10,
  maxReferralRewards: 5,
} as const;
