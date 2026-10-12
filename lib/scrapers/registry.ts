import type { Collector, ScrapeMethod } from "./types";
import { createPublicwwwCollector } from "./publicwww";
import { createViewdnsCollector } from "./viewdns";
import { createScriptCollector } from "./script";
import { createDomainlistCollector } from "./domainlist";
import { createGoogleplacesCollector } from "./googleplaces";
import { createAgencyCollector } from "./agency";

/**
 * Method -> collector.
 *
 * A new collection method is a new file and one line here. Nothing in the
 * worker, the pages or the database enumerates the methods -- they only know
 * the enum, and the enum is the one place a new value has to be added.
 */
export function getCollector(method: ScrapeMethod): Collector<unknown> {
  switch (method) {
    case "publicwww":
      return createPublicwwwCollector() as Collector<unknown>;
    case "viewdns":
      return createViewdnsCollector() as Collector<unknown>;
    case "script":
      return createScriptCollector() as Collector<unknown>;
    case "domainlist":
      return createDomainlistCollector() as Collector<unknown>;
    case "googleplaces":
      return createGoogleplacesCollector() as Collector<unknown>;
    case "agency":
      return createAgencyCollector() as Collector<unknown>;
  }
}
