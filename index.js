const Puppeteer = require('puppeteer');
const ExchangeCodeException = require('./exceptions/ExchangeCodeException');

class EpicGamesClientLoginAdapter {

  constructor (browser) {
    this.browser = browser;
  }

  close () {
    return this.browser.close();
  }

  async getExchangeCode () {
    try {
      const page = await this.browser.pages().then(pages => pages[0]);

      const oldXsrfToken = (await page.cookies()).find((c) => c.name === 'XSRF-TOKEN').value;
      page.once('request', (req) => {
        req.continue({
          method: 'GET',
          headers: {
            ...req.headers,
            'X-XSRF-TOKEN': oldXsrfToken,
          },
        });
      });
      await page.setRequestInterception(true);
      await page.goto('https://www.epicgames.com/id/api/authenticate');
      await page.setRequestInterception(false);
      
      page.once('request', (req) => {
        req.continue({
          method: 'GET',
          headers: {
            ...req.headers,
            'X-XSRF-TOKEN': oldXsrfToken,
          },
        });
      });
      await page.setRequestInterception(true);
        try {
          await page.goto('https://www.epicgames.com/id/api/csrf');
        } catch (e) {}
      await page.setRequestInterception(false);
      

      const xsrfToken = (await page.cookies()).find((c) => c.name === 'XSRF-TOKEN').value;
      page.once('request', (req) => {
        req.continue({
          method: 'POST',
          headers: {
            ...req.headers,
            'X-XSRF-TOKEN': xsrfToken,
          },
        });
      });
      await page.setRequestInterception(true);
      const response = await (await page.goto('https://www.epicgames.com/id/api/exchange/generate')).json();
      await page.setRequestInterception(false);


      if (!response.code) {
        throw new ExchangeCodeException(`Unexcepted response: ${JSON.stringify(response)}`);
      }
      return response.code;
    } catch (error) {
      if (error instanceof ExchangeCodeException) {
        throw error;
      }
      throw new ExchangeCodeException(`Exchange code cannot be obtained (${error.toString()})`);
    }
  }

  static async init (credentials={}, userOptions={}) {
    const options = {
      language: 'en-US',
      width: 500,
      height: 800,
      inputDelay: 100,
      enterCredentialsTimeout: 60000,
      puppeteer: {},
      ...userOptions,
    };
    const browser = await Puppeteer.launch({
      headless: false,
      defaultViewport: {
        width: options.width,
        height: options.height,
      },
      args: [
        `--window-size=${options.width},${options.height}`,
        `--lang=${options.language}`,
      ],
      ...options.puppeteer,
    });
    const page = await browser.pages().then(pages => pages[0]);
    await page.goto('https://epicgames.com/id');
    const login = credentials.login || credentials.email || credentials.username;
    if (login && credentials.password) {
      const loginWithEpicButton = await page.waitForSelector('#login-with-epic');
      await loginWithEpicButton.click();
      const usernameOrEmailField = await page.waitForSelector('#email');
      await usernameOrEmailField.type(login, { delay: options.inputDelay });
      const passwordField = await page.waitForSelector('#password');
      await passwordField.type(credentials.password, { delay: options.inputDelay });
      const loginButton = await page.waitForSelector('#sign-in:not(:disabled)');
      await loginButton.click();
    }
    await page.waitForResponse((response) => response.url() === 'https://www.epicgames.com/account/personal', {
      timeout: options.enterCredentialsTimeout,
    });
    return new this(browser);
  }

}

module.exports = EpicGamesClientLoginAdapter;
