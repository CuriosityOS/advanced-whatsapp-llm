/**
 * Weather Tool
 * Gets current weather information for a location
 */

const axios = require('axios');

module.exports = {
  name: 'weather',
  description: 'Get current weather conditions and forecast for any location',
  parameters: {
    type: 'object',
    properties: {
      location: {
        type: 'string',
        description: 'City name, country, or coordinates (e.g., "New York", "London, UK", "40.7128,-74.0060")'
      },
      units: {
        type: 'string',
        description: 'Temperature units: celsius, fahrenheit, or kelvin',
        enum: ['celsius', 'fahrenheit', 'kelvin'],
        default: 'celsius'
      }
    },
    required: ['location']
  },
  enabled: true,
  category: 'information',
  version: '1.0.0',
  rateLimit: {
    maxCalls: 20,
    windowMs: 60000 // 20 calls per minute
  },

  async execute({ location, units = 'celsius' }, context) {
    try {
      const weatherData = await this.getWeatherData(location, units);

      if (!weatherData) {
        return {
          success: false,
          error: 'Location not found',
          message: `Sorry, I couldn't find weather information for "${location}". Please check the location name and try again.`
        };
      }

      const {
        locationName,
        temperature,
        description,
        humidity,
        windSpeed,
        pressure,
        feelsLike,
        icon
      } = weatherData;

      const unitSymbol = units === 'fahrenheit' ? '°F' : units === 'kelvin' ? 'K' : '°C';
      const windUnit = units === 'fahrenheit' ? 'mph' : 'km/h';

      const weatherMessage = `🌤️ **Weather in ${locationName}**\n\n` +
        `🌡️ **Temperature:** ${temperature}${unitSymbol} (feels like ${feelsLike}${unitSymbol})\n` +
        `☁️ **Conditions:** ${description}\n` +
        `💧 **Humidity:** ${humidity}%\n` +
        `💨 **Wind Speed:** ${windSpeed} ${windUnit}\n` +
        `🔽 **Pressure:** ${pressure} hPa`;

      return {
        success: true,
        data: {
          location: locationName,
          temperature,
          description,
          humidity,
          windSpeed,
          pressure,
          feelsLike,
          units,
          icon
        },
        message: weatherMessage
      };

    } catch (error) {
      console.error('Weather tool error:', error);
      return {
        success: false,
        error: error.message,
        message: `Sorry, I couldn't get weather information for "${location}". The weather service might be unavailable.`
      };
    }
  },

  async getWeatherData(location, units) {
    // This is a mock implementation - replace with real weather API
    // Popular weather APIs:
    // - OpenWeatherMap API
    // - WeatherAPI
    // - AccuWeather API
    // - Weather.gov (US only)
    
    // Mock weather data for demonstration
    const mockData = {
      locationName: location,
      temperature: Math.round(Math.random() * 30 + 10), // Random temp between 10-40
      description: ['Sunny', 'Partly Cloudy', 'Cloudy', 'Light Rain', 'Clear'][Math.floor(Math.random() * 5)],
      humidity: Math.round(Math.random() * 40 + 30), // 30-70%
      windSpeed: Math.round(Math.random() * 20 + 5), // 5-25
      pressure: Math.round(Math.random() * 50 + 1000), // 1000-1050 hPa
      feelsLike: Math.round(Math.random() * 30 + 10),
      icon: '01d'
    };

    // Convert temperature based on units
    if (units === 'fahrenheit') {
      mockData.temperature = Math.round(mockData.temperature * 9/5 + 32);
      mockData.feelsLike = Math.round(mockData.feelsLike * 9/5 + 32);
    } else if (units === 'kelvin') {
      mockData.temperature = Math.round(mockData.temperature + 273.15);
      mockData.feelsLike = Math.round(mockData.feelsLike + 273.15);
    }

    return mockData;

    // Real implementation example (uncomment and configure):
    /*
    try {
      const apiKey = process.env.OPENWEATHER_API_KEY;
      if (!apiKey) {
        throw new Error('Weather API key not configured');
      }

      const unitParam = units === 'fahrenheit' ? 'imperial' : units === 'kelvin' ? 'standard' : 'metric';
      
      const response = await axios.get('http://api.openweathermap.org/data/2.5/weather', {
        params: {
          q: location,
          appid: apiKey,
          units: unitParam
        },
        timeout: 10000
      });

      const data = response.data;
      
      return {
        locationName: `${data.name}, ${data.sys.country}`,
        temperature: Math.round(data.main.temp),
        description: data.weather[0].description,
        humidity: data.main.humidity,
        windSpeed: Math.round(data.wind.speed),
        pressure: data.main.pressure,
        feelsLike: Math.round(data.main.feels_like),
        icon: data.weather[0].icon
      };
    } catch (error) {
      if (error.response?.status === 404) {
        return null; // Location not found
      }
      throw error;
    }
    */
  }
};