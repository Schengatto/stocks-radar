export const parseDate = (input) => {
    let date;
    if (typeof input === 'number') {
        // Detect if timestamp is in seconds
        date = input < 1e12 ? new Date(input * 1000) : new Date(input);
    } else if (input instanceof Date) {
        date = new Date(input.getTime()); // clone
    } else if (typeof input === 'string') {
        const parsed = Date.parse(input);
        if (isNaN(parsed)) throw new Error('Invalid date string');
        date = new Date(parsed);
    } else {
        throw new Error('Unsupported input type');
    }

    if (isNaN(date.getTime())) throw new Error('Invalid date');

    // Format to YYYY-MM-DD
    const year = date.getFullYear();
    const month = `${date.getMonth() + 1}`.padStart(2, '0');
    const day = `${date.getDate()}`.padStart(2, '0');

    return `${year}-${month}-${day}`;
}

export const parseInUSD = (amount) => `$ ${amount?.toLocaleString() || 0}`;