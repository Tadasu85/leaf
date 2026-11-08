import config from '../../config';

/**
 * How a guest becomes a Hive player. Shown by the `signup` command, both on
 * the welcome screen and while playing as a guest. Uses the same Ecency
 * referral link as the welcome screen.
 */

export const HIVE_SIGNUP_URL = 'https://signup.hive.io';
export const HIVE_KEYCHAIN_URL = 'https://hive-keychain.com';
export const ecencySignupUrl = (): string => `https://ecency.com/signup/free?referral=${config.game.account}`;

export const signupLines = (): string[] => [
  'Leaf runs on the Hive blockchain, so a Hive account is your character: it keeps your place, your description and the rooms you build.',
  `1. Get a free Hive account at [ecency.com/signup](${ecencySignupUrl()}), or see every provider at [signup.hive.io](${HIVE_SIGNUP_URL}).`,
  `2. Install [Hive Keychain](${HIVE_KEYCHAIN_URL}) and add your new account to it. Keep your keys somewhere safe.`,
  "3. Come back and type 'login <your account name>'. If you played as a guest in this browser, you'll start where your guest left off."
];
