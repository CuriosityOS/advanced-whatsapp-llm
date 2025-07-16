/**
 * Time Tool
 * Provides current time information for different timezones
 */

module.exports = {
  name: 'time',
  description: 'Get current time, date, and timezone information for any location or timezone',
  parameters: {
    type: 'object',
    properties: {
      timezone: {
        type: 'string',
        description: 'Timezone or location (e.g., "America/New_York", "UTC", "London", "Tokyo")',
        default: 'UTC'
      },
      format: {
        type: 'string',
        description: 'Time format: 12hour, 24hour, or iso',
        enum: ['12hour', '24hour', 'iso'],
        default: '24hour'
      }
    }
  },
  enabled: true,
  category: 'utility',
  version: '1.0.0',

  async execute({ timezone = 'UTC', format = '24hour' }, context) {
    try {
      const timeInfo = this.getTimeInfo(timezone, format);

      if (!timeInfo) {
        return {
          success: false,
          error: 'Invalid timezone',
          message: `Sorry, I couldn't find timezone information for "${timezone}". Please use a valid timezone like "America/New_York" or city name.`
        };
      }

      const {
        currentTime,
        currentDate,
        timezoneName,
        utcOffset,
        dayOfWeek,
        dayOfYear,
        isWeekend
      } = timeInfo;

      const timeMessage = `🕐 **Time Information**\n\n` +
        `📍 **Location:** ${timezoneName}\n` +
        `🕒 **Time:** ${currentTime}\n` +
        `📅 **Date:** ${currentDate}\n` +
        `📆 **Day:** ${dayOfWeek} ${isWeekend ? '(Weekend)' : '(Weekday)'}\n` +
        `🌍 **UTC Offset:** ${utcOffset}\n` +
        `📊 **Day of Year:** ${dayOfYear}`;

      return {
        success: true,
        data: {
          timezone: timezoneName,
          time: currentTime,
          date: currentDate,
          dayOfWeek,
          dayOfYear,
          utcOffset,
          isWeekend,
          timestamp: Date.now()
        },
        message: timeMessage
      };

    } catch (error) {
      console.error('Time tool error:', error);
      return {
        success: false,
        error: error.message,
        message: `Sorry, I couldn't get time information for "${timezone}". Please check the timezone format.`
      };
    }
  },

  getTimeInfo(timezone, format) {
    try {
      // Handle common city names by mapping to timezone identifiers
      const timezoneMap = {
        'london': 'Europe/London',
        'paris': 'Europe/Paris',
        'tokyo': 'Asia/Tokyo',
        'sydney': 'Australia/Sydney',
        'new york': 'America/New_York',
        'los angeles': 'America/Los_Angeles',
        'chicago': 'America/Chicago',
        'denver': 'America/Denver',
        'utc': 'UTC',
        'gmt': 'GMT'
      };

      const normalizedTimezone = timezoneMap[timezone.toLowerCase()] || timezone;

      const now = new Date();
      const options = { timeZone: normalizedTimezone };

      // Get formatted time based on format preference
      let currentTime;
      switch (format) {
        case '12hour':
          currentTime = now.toLocaleTimeString('en-US', {
            ...options,
            hour12: true,
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
          });
          break;
        case 'iso':
          currentTime = new Date(now.toLocaleString('en-US', options)).toISOString();
          break;
        case '24hour':
        default:
          currentTime = now.toLocaleTimeString('en-US', {
            ...options,
            hour12: false,
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
          });
          break;
      }

      const currentDate = now.toLocaleDateString('en-US', {
        ...options,
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      });

      const dayOfWeek = now.toLocaleDateString('en-US', { ...options, weekday: 'long' });
      const isWeekend = ['Saturday', 'Sunday'].includes(dayOfWeek);

      // Calculate day of year
      const startOfYear = new Date(now.getFullYear(), 0, 1);
      const dayOfYear = Math.floor((now - startOfYear) / (24 * 60 * 60 * 1000)) + 1;

      // Get UTC offset
      const offsetMinutes = now.getTimezoneOffset();
      const offsetHours = Math.floor(Math.abs(offsetMinutes) / 60);
      const offsetMins = Math.abs(offsetMinutes) % 60;
      const offsetSign = offsetMinutes <= 0 ? '+' : '-';
      const utcOffset = `UTC${offsetSign}${offsetHours.toString().padStart(2, '0')}:${offsetMins.toString().padStart(2, '0')}`;

      return {
        currentTime,
        currentDate,
        timezoneName: normalizedTimezone,
        utcOffset,
        dayOfWeek,
        dayOfYear,
        isWeekend
      };

    } catch (error) {
      console.error('Invalid timezone:', timezone, error);
      return null;
    }
  }
};