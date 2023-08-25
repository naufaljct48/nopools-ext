import {
  ContentRating,
  SourceInfo,
  BadgeColor,
  SourceIntents,
} from "@paperback/types";

import { getExportVersion, Madara } from "../Madara";

const DOMAIN = "https://worldmanhwas.bar";

export const WorldManhwasInfo: SourceInfo = {
  version: getExportVersion("0.0.1"),
  name: "WorldManhwas",
  description: `Extension that pulls manga from ${DOMAIN}`,
  author: "NaufalJCT48",
  authorWebsite: "http://github.com/NaufalJCT48",
  icon: "icon.png",
  contentRating: ContentRating.EVERYONE,
  websiteBaseURL: DOMAIN,
  sourceTags: [
    {
      text: "Indonesian",
      type: BadgeColor.GREY,
    },
  ],
  intents:
    SourceIntents.MANGA_CHAPTERS |
    SourceIntents.HOMEPAGE_SECTIONS |
    SourceIntents.CLOUDFLARE_BYPASS_REQUIRED |
    SourceIntents.SETTINGS_UI,
};

export class WorldManhwas extends Madara {
  baseUrl: string = DOMAIN;

  override alternativeChapterAjaxEndpoint = true;

  override hasAdvancedSearchPage = true;

  override directoryPath = "komik";
}
