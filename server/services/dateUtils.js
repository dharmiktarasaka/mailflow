/**
 * Utility function to calculate the next business date by skipping weekends
 * @param {Date} startDate - The starting date
 * @param {number} daysToAdd - Number of business days to add (must be >= 0)
 * @returns {Date} The resulting date after adding business days (skipping Sat/Sun)
 */
function getNextBusinessDate(startDate, daysToAdd) {
  if (daysToAdd < 0) {
    throw new Error('daysToAdd must be non-negative');
  }
  
  const result = new Date(startDate);
  let daysAdded = 0;
  
  while (daysAdded < daysToAdd) {
    result.setDate(result.getDate() + 1);
    const dayOfWeek = result.getDay(); // 0 = Sunday, 1 = Monday, ..., 6 = Saturday
    
    // Skip weekends (0 = Sunday, 6 = Saturday)
    if (dayOfWeek !== 0 && dayOfWeek !== 6) {
      daysAdded++;
    }
  }
  
  return result;
}

export { getNextBusinessDate };