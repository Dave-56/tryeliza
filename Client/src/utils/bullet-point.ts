/**
 * Splits text that's already formatted with bullet points
 */
export const splitIntoBulletPoints = (text: string): string[] => {
  console.log("bullet point text", text);
  return text
    .split('\n\n')
    .map(point => point.trim())
    .filter(point => point.length > 0);
};

/**
 * Formats text as bullet points
 */
export const formatAsBulletPoints = (text: string): string => {
  console.log("formatting as bullet points", text);
  const points = splitIntoBulletPoints(text);
  return points.join('\n\n');
}