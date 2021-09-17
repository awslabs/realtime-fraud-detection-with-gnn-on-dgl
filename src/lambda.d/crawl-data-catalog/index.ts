/* eslint import/no-unresolved: "off" */
/* eslint @typescript-eslint/no-require-imports: "off" */
import { Handler } from 'aws-lambda';
const { Glue } = require('@aws-sdk/client-glue');

export type CrawlDataCatalogEventHandler = Handler<CrawlDataCatalogEvent, void>;

export interface CrawlDataCatalogEvent {
  crawlerName: string;
}

const client = new Glue();

export const crawler: CrawlDataCatalogEventHandler = async (event, _context, callback) => {
  console.info(`Receiving crawl data catalog event ${JSON.stringify(event, null, 2)}.`);

  try {
    await client.startCrawler({
      Name: event.crawlerName,
    });

    console.debug(`Started the glue crawler '${event.crawlerName}'.`);

    while (true) {
      const getCrawlerMetricsResp = await client.getCrawlerMetrics({
        CrawlerNameList: [event.crawlerName],
      });
      console.debug(`The response of glue's getCralwerMetrics is ${JSON.stringify(getCrawlerMetricsResp)}.`);
      const crawlerMetric = getCrawlerMetricsResp.CrawlerMetricsList[0];
      if (crawlerMetric.StillEstimating || (crawlerMetric.TimeLeftSeconds && crawlerMetric.TimeLeftSeconds > 0)) {
        await delay(1000*10);
      } else {
        console.debug(`The crawler '${event.crawlerName}' created ${crawlerMetric.TablesCreated} tables, \
                    deleted ${crawlerMetric.TablesDeleted} tables, updated ${crawlerMetric.TablesUpdated} tables.`);
        break;
      }
    }

    callback(null);
  } catch (err) {
    if (err instanceof Error) {
      console.error(err, err.stack);
      callback(err);
    }
  }
};

function delay(ms: number) {
  return new Promise( resolve => setTimeout(resolve, ms) );
}