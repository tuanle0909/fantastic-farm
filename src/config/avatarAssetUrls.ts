/**
 * Canonical 1024 SVG layers from repo `/avatar-assets`. Import with `?url` for <img>.
 */
import femaleBaseUrl from "@avatar-assets/female_base.svg?url";
import maleBaseUrl from "@avatar-assets/male_base.svg?url";
import eyesUrl from "@avatar-assets/eyes.svg?url";

import maleHair1 from "@avatar-assets/hair/male-hair/hair1.svg?url";
import maleHair2 from "@avatar-assets/hair/male-hair/hair2.svg?url";
import maleHair3 from "@avatar-assets/hair/male-hair/hair3.svg?url";
import maleHair4 from "@avatar-assets/hair/male-hair/hair4.svg?url";
import maleHair5 from "@avatar-assets/hair/male-hair/hair5.svg?url";

import maleOutfit1 from "@avatar-assets/outfit/male-outfit/outfit1.svg?url";
import maleOutfit2 from "@avatar-assets/outfit/male-outfit/outfit2.svg?url";
import maleOutfit3 from "@avatar-assets/outfit/male-outfit/outfit3.svg?url";
import maleOutfit4 from "@avatar-assets/outfit/male-outfit/outfit4.svg?url";

export const AVATAR_CANVAS_PX = 1024;

export type AvatarGenderId = "male" | "female";

export function baseLayerUrl(gender: AvatarGenderId): string {
    return gender === "female" ? femaleBaseUrl : maleBaseUrl;
}

export const EYES_LAYER_URL = eyesUrl;

export const maleHairVariants: { id: string; label: string; url: string }[] = [
    { id: "hair1", label: "Hair 1", url: maleHair1 },
    { id: "hair2", label: "Hair 2", url: maleHair2 },
    { id: "hair3", label: "Hair 3", url: maleHair3 },
    { id: "hair4", label: "Hair 4", url: maleHair4 },
    { id: "hair5", label: "Hair 5", url: maleHair5 },
];

export const maleOutfitVariants: { id: string; label: string; url: string }[] = [
    { id: "outfit1", label: "Outfit 1", url: maleOutfit1 },
    { id: "outfit2", label: "Outfit 2", url: maleOutfit2 },
    { id: "outfit3", label: "Outfit 3", url: maleOutfit3 },
    { id: "outfit4", label: "Outfit 4", url: maleOutfit4 },
];
