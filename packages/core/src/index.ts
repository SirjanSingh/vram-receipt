export * from "./types";
export { SKUS, STEAM_VRAM, STEAM_RAM, CPI_NOW, STEAM_SURVEY_LABEL } from "./generated/data";
export { matchGpu, cleanName, snapMbToGb, vramHintGb, generationOf, sizesFor } from "./match";
export { parseNvidiaSmi } from "./parseNvidiaSmi";
export { median, genMedianMbPerDollar, steamPlacement, nominalRamGb } from "./metrics";
export { buildReceipt, WIDTH, DATA_URL } from "./receipt";
export type { Receipt, ReceiptInput } from "./receipt";
export { receiptSvg } from "./receiptSvg";
export { VERDICTS } from "./verdicts";
