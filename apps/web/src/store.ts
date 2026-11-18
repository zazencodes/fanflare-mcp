import {
  type Env,
  rows,
  first,
  required,
  statement,
  fail,
  now,
} from "./common.ts";
import {
  avatarSchema,
  avatarSlots,
  type Avatar,
} from "../../../packages/contracts/social.ts";
import { award, sparksForLevel } from "./sparks.ts";
import { socialAction } from "./social.ts";
import { avatarSrc, avatarTag, purgeImages } from "./images.ts";
export type StoreItem = {
  id: string;
  slot: (typeof avatarSlots)[number];
  name: string;
  rarity: "common" | "rare" | "epic" | "legendary";
  price: number;
  unlockLevel?: number;
  starter?: boolean;
};
export const CATALOG: readonly StoreItem[] = [
  {
    id: "headwear-ribbon",
    slot: "headwear",
    name: "Peach ribbon",
    rarity: "common",
    price: 0,
    starter: true,
  },
  {
    id: "eyewear-reading",
    slot: "eyewear",
    name: "Reading glasses",
    rarity: "common",
    price: 0,
    starter: true,
  },
  {
    id: "outfit-knit",
    slot: "outfit",
    name: "Knitted vest",
    rarity: "common",
    price: 0,
    starter: true,
  },
  {
    id: "frame-paper",
    slot: "frame",
    name: "Paper frame",
    rarity: "common",
    price: 0,
    starter: true,
  },

  {
    id: "body-starter",
    slot: "body",
    name: "Fox",
    rarity: "common",
    price: 0,
    starter: true,
  },
  {
    id: "body-owl",
    slot: "body",
    name: "Owl",
    rarity: "common",
    price: 0,
    starter: true,
  },
  {
    id: "body-cat",
    slot: "body",
    name: "Cat",
    rarity: "common",
    price: 0,
    starter: true,
  },
  {
    id: "body-dragonling",
    slot: "body",
    name: "Dragonling",
    rarity: "common",
    price: 0,
    starter: true,
  },
  {
    id: "palette-starter",
    slot: "palette",
    name: "Lavender",
    rarity: "common",
    price: 0,
    starter: true,
  },
  {
    id: "palette-apricot",
    slot: "palette",
    name: "Apricot",
    rarity: "common",
    price: 0,
    starter: true,
  },
  {
    id: "palette-cloud",
    slot: "palette",
    name: "Cloud",
    rarity: "common",
    price: 0,
    starter: true,
  },
  {
    id: "palette-rose",
    slot: "palette",
    name: "Rose",
    rarity: "common",
    price: 0,
    starter: true,
  },
  {
    id: "palette-sage",
    slot: "palette",
    name: "Sage",
    rarity: "common",
    price: 0,
    starter: true,
  },
  {
    id: "palette-honey",
    slot: "palette",
    name: "Honey",
    rarity: "common",
    price: 0,
    starter: true,
  },
  {
    id: "background-starter",
    slot: "background",
    name: "Dawn paper",
    rarity: "common",
    price: 0,
    starter: true,
  },
  {
    id: "background-sky",
    slot: "background",
    name: "Blue hour",
    rarity: "common",
    price: 0,
    starter: true,
  },
  {
    id: "background-peach",
    slot: "background",
    name: "Peach paper",
    rarity: "common",
    price: 0,
    starter: true,
  },
  {
    id: "headwear-starter",
    slot: "headwear",
    name: "Bare ears",
    rarity: "common",
    price: 0,
    starter: true,
  },
  {
    id: "eyewear-starter",
    slot: "eyewear",
    name: "Bright eyes",
    rarity: "common",
    price: 0,
    starter: true,
  },
  {
    id: "outfit-starter",
    slot: "outfit",
    name: "Soft fur",
    rarity: "common",
    price: 0,
    starter: true,
  },
  {
    id: "helditem-starter",
    slot: "heldItem",
    name: "Paperback",
    rarity: "common",
    price: 0,
    starter: true,
  },
  {
    id: "helditem-none",
    slot: "heldItem",
    name: "Empty paws",
    rarity: "common",
    price: 0,
    starter: true,
  },
  {
    id: "frame-starter",
    slot: "frame",
    name: "Unframed",
    rarity: "common",
    price: 0,
    starter: true,
  },
  {
    id: "body-moth",
    slot: "body",
    name: "Moth",
    rarity: "rare",
    price: 150,
    unlockLevel: 2,
  },
  {
    id: "body-hare",
    slot: "body",
    name: "Hare",
    rarity: "common",
    price: 50,
    unlockLevel: 1,
  },
  {
    id: "palette-dusk",
    slot: "palette",
    name: "Dusk",
    rarity: "common",
    price: 50,
    unlockLevel: 1,
  },
  {
    id: "palette-lilac",
    slot: "palette",
    name: "Lilac",
    rarity: "rare",
    price: 150,
    unlockLevel: 2,
  },
  {
    id: "palette-peach",
    slot: "palette",
    name: "Peach",
    rarity: "epic",
    price: 600,
    unlockLevel: 4,
  },
  {
    id: "palette-tide",
    slot: "palette",
    name: "Tide",
    rarity: "legendary",
    price: 1200,
    unlockLevel: 7,
  },
  {
    id: "background-garden",
    slot: "background",
    name: "Secret garden",
    rarity: "common",
    price: 50,
    unlockLevel: 1,
  },
  {
    id: "background-midnight",
    slot: "background",
    name: "Midnight",
    rarity: "rare",
    price: 150,
    unlockLevel: 2,
  },
  {
    id: "background-aurora",
    slot: "background",
    name: "Aurora",
    rarity: "epic",
    price: 600,
    unlockLevel: 4,
  },
  {
    id: "background-starlit",
    slot: "background",
    name: "Starlit",
    rarity: "legendary",
    price: 1200,
    unlockLevel: 7,
  },
  {
    id: "headwear-beret",
    slot: "headwear",
    name: "Poet beret",
    rarity: "common",
    price: 50,
    unlockLevel: 1,
  },
  {
    id: "headwear-beanie",
    slot: "headwear",
    name: "Reading beanie",
    rarity: "rare",
    price: 150,
    unlockLevel: 2,
  },
  {
    id: "headwear-flower",
    slot: "headwear",
    name: "Blossom",
    rarity: "epic",
    price: 600,
    unlockLevel: 4,
  },
  {
    id: "headwear-moon",
    slot: "headwear",
    name: "Moon cap",
    rarity: "legendary",
    price: 1200,
    unlockLevel: 7,
  },
  {
    id: "headwear-wizard",
    slot: "headwear",
    name: "Story wizard",
    rarity: "common",
    price: 50,
    unlockLevel: 1,
  },
  {
    id: "crown",
    slot: "headwear",
    name: "Crown",
    rarity: "legendary",
    price: 2000,
    unlockLevel: 12,
  },
  {
    id: "amber-glasses",
    slot: "eyewear",
    name: "Amber glasses",
    rarity: "common",
    price: 50,
    unlockLevel: 1,
  },
  {
    id: "eyewear-rose",
    slot: "eyewear",
    name: "Rose glasses",
    rarity: "rare",
    price: 150,
    unlockLevel: 2,
  },
  {
    id: "eyewear-ink",
    slot: "eyewear",
    name: "Ink spectacles",
    rarity: "epic",
    price: 600,
    unlockLevel: 4,
  },
  {
    id: "eyewear-moon",
    slot: "eyewear",
    name: "Moon spectacles",
    rarity: "legendary",
    price: 1200,
    unlockLevel: 7,
  },
  {
    id: "outfit-scarf",
    slot: "outfit",
    name: "Rose scarf",
    rarity: "common",
    price: 50,
    unlockLevel: 1,
  },
  {
    id: "outfit-cardigan",
    slot: "outfit",
    name: "Cloud cardigan",
    rarity: "rare",
    price: 150,
    unlockLevel: 2,
  },
  {
    id: "outfit-cloak",
    slot: "outfit",
    name: "Story cloak",
    rarity: "epic",
    price: 600,
    unlockLevel: 4,
  },
  {
    id: "outfit-apron",
    slot: "outfit",
    name: "Garden apron",
    rarity: "legendary",
    price: 1200,
    unlockLevel: 7,
  },
  {
    id: "outfit-velvet",
    slot: "outfit",
    name: "Velvet coat",
    rarity: "common",
    price: 50,
    unlockLevel: 1,
  },
  {
    id: "helditem-tea",
    slot: "heldItem",
    name: "Warm tea",
    rarity: "common",
    price: 50,
    unlockLevel: 1,
  },
  {
    id: "helditem-lantern",
    slot: "heldItem",
    name: "Lantern",
    rarity: "rare",
    price: 150,
    unlockLevel: 2,
  },
  {
    id: "helditem-quill",
    slot: "heldItem",
    name: "Quill",
    rarity: "epic",
    price: 600,
    unlockLevel: 4,
  },
  {
    id: "helditem-atlas",
    slot: "heldItem",
    name: "Atlas",
    rarity: "legendary",
    price: 1200,
    unlockLevel: 7,
  },
  {
    id: "helditem-grimoire",
    slot: "heldItem",
    name: "Grimoire",
    rarity: "common",
    price: 50,
    unlockLevel: 1,
  },
  {
    id: "helditem-gold",
    slot: "heldItem",
    name: "Golden edition",
    rarity: "rare",
    price: 150,
    unlockLevel: 2,
  },
  {
    id: "moon-frame",
    slot: "frame",
    name: "Moon frame",
    rarity: "rare",
    price: 50,
    unlockLevel: 1,
  },
  {
    id: "star-frame",
    slot: "frame",
    name: "Star frame",
    rarity: "epic",
    price: 100,
    unlockLevel: 3,
  },
  {
    id: "frame-laurel",
    slot: "frame",
    name: "Laurel frame",
    rarity: "epic",
    price: 600,
    unlockLevel: 4,
  },
  {
    id: "frame-sun",
    slot: "frame",
    name: "Sun frame",
    rarity: "legendary",
    price: 1200,
    unlockLevel: 7,
  },
];
export function catalogItem(item: string) {
  return CATALOG.find((i) => i.id === item) ?? fail("Unknown store item");
}
export async function ownedItems(env: Env, user: string) {
  return (
    await rows(env, "SELECT item FROM store_ownership WHERE user_id=?", user)
  ).map((r) => r.item as string);
}
export async function validateAvatar(env: Env, user: string, input: unknown) {
  const avatar = avatarSchema.parse(input),
    owned = await ownedItems(env, user);
  const r = await first(
    env,
    `SELECT COALESCE(SUM(CASE WHEN spend=0 THEN amount ELSE 0 END),0) lifetime FROM sparks_ledger WHERE user_id=?`,
    user,
  );
  for (const [slot, item] of Object.entries(avatar)) {
    const gear = catalogItem(item!);
    if (gear.slot !== slot) fail("Item does not fit this avatar slot");
    if (!gear.starter && !owned.includes(gear.id))
      fail("Item is not owned", 403);
    const level = gear.unlockLevel ?? 1;
    if (Number(r!.lifetime) < sparksForLevel(level))
      fail("Item level is locked", 403);
  }
  return avatar;
}
export async function buyItem(
  env: Env,
  user: string,
  item: string,
  request_key: string,
) {
  const gear = catalogItem(item),
    level = gear.unlockLevel ?? 1;
  const result = await socialAction(
    env,
    user,
    "buy",
    { request_key, item } as any,
    async (token) => [
      statement(
        env,
        `INSERT OR IGNORE INTO store_ownership(user_id,item,created,purchase_id) SELECT ?,?,?,? WHERE
 (SELECT COALESCE(SUM(amount),0) FROM sparks_ledger WHERE user_id=?)>=?
 AND (SELECT COALESCE(SUM(CASE WHEN spend=0 THEN amount ELSE 0 END),0) FROM sparks_ledger WHERE user_id=?)>=?
 AND NOT EXISTS(SELECT 1 FROM seed_studio WHERE user_id=?)`,
        user,
        item,
        now(),
        token,
        user,
        gear.price,
        user,
        sparksForLevel(level),
        user,
      ),
      statement(
        env,
        `INSERT OR IGNORE INTO sparks_ledger(id,user_id,action,subject,reference,amount,created,spend)
 SELECT ?,?,'purchase',?,?,?, ?,1 WHERE EXISTS(SELECT 1 FROM store_ownership WHERE user_id=? AND item=? AND purchase_id=?)`,
        token,
        user,
        item,
        item,
        -gear.price,
        now(),
        user,
        item,
        token,
      ),
    ],
  );
  if (
    !(await first(
      env,
      "SELECT 1 FROM store_ownership WHERE user_id=? AND item=?",
      user,
      item,
    ))
  )
    fail("Insufficient sparks or level", 409);
  return { ...result, item, owned: true };
}
export async function saveAvatar(
  env: Env,
  user: string,
  input: Avatar,
  request_key: string,
) {
  await required(
    env,
    "SELECT 1 FROM profiles WHERE user_id=? AND studio=0",
    user,
  );
  const avatar = await validateAvatar(env, user, input);
  const result = await socialAction(
    env,
    user,
    "avatar",
    { request_key, avatar } as any,
    async () => avatarWrites(env, user, avatar),
  );
  await purgeImages(env, [avatarTag(user)]);
  const p = await required(
    env,
    "SELECT handle,private,avatar FROM profiles WHERE user_id=?",
    user,
  );
  return {
    ...result,
    handle: p.handle as string,
    avatarSrc: avatarSrc({
      handle: p.handle,
      avatar: JSON.parse(p.avatar),
      private: !!p.private,
    }),
  };
}
export async function equipItem(
  env: Env,
  user: string,
  item: string,
  request_key: string,
) {
  const gear = catalogItem(item);
  const result = await socialAction(
    env,
    user,
    "equip",
    { request_key, item },
    async () => {
      const profile = await required(
        env,
        "SELECT avatar FROM profiles WHERE user_id=? AND studio=0",
        user,
      );
      const avatar = await validateAvatar(env, user, {
        ...avatarSchema.parse(JSON.parse(profile.avatar)),
        [gear.slot]: item,
      });
      return avatarWrites(env, user, avatar);
    },
  );
  await purgeImages(env, [avatarTag(user)]);
  return result;
}
function avatarWrites(env: Env, user: string, avatar: Avatar) {
  return [
    statement(
      env,
      "UPDATE profiles SET avatar=? WHERE user_id=? AND studio=0",
      JSON.stringify(avatar),
      user,
    ),
    award(
      env,
      user,
      "profile",
      "complete",
      null,
      `EXISTS(SELECT 1 FROM profiles WHERE user_id=? AND avatar<>'{}')`,
      [user],
    ),
  ];
}
