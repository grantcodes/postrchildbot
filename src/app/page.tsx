const HomePage = () => (
  <>
    <p>
      PostrChild is a suite of{' '}
      <a href="https://indieweb.org/micropub">micropub</a> clients to help you
      post to your <a href="https://indieweb.org">indieweb</a> site.
    </p>
    <p>
      Currently available is a <a href="#bot">chat bot</a>, a{' '}
      <a href="#photos">photo album</a> creator and a{' '}
      <a href="#extension">browser extension</a>
    </p>

    <h2 id="bot">Chat Bot</h2>

    <p>
      The chat bot is built with the microsoft bot framework and is available to
      use on multiple platforms. Just click one of the buttons below to get
      started
    </p>

    <p>
      <a className="button" href="https://www.messenger.com/t/1845133039077197">
        Facebook Messenger
      </a>
      <a
        className="button"
        href="https://join.skype.com/bot/4c2a1dd4-00bb-4d5c-a0d7-b8f8af9547f8"
      >
        Skype
      </a>
      <a
        className="button"
        href="https://slack.com/oauth/authorize?scope=bot&client_id=8196491008.124913786947&redirect_uri=https%3a%2f%2fslack.botframework.com%2fHome%2fauth&state=postrchild"
      >
        Slack
      </a>
      <a className="button" href="https://t.me/PostrChildBot">
        Telegram
      </a>
    </p>

    <h2 id="photos">PhotoPostr</h2>

    <p>
      PhotoPostr is a micropub client to publish photo albums to your site. It
      supports large galleries by using your{' '}
      <a href="https://indieweb.org/micropub_media_endpoint">media endpoint</a>
    </p>
    <a className="button" href="https://photo.postrchild.com">
      Open PhotoPostr
    </a>

    <h2 id="extension">Browser Extension</h2>

    <p>An experimental browser extension is available on chrome and firefox.</p>
    <p>
      It supports posting on your on website via an inline editor interface.
    </p>

    <a
      className="button"
      href="https://chrome.google.com/webstore/detail/ecifafdialoohbgngelfbjplgbhiklpm"
    >
      Chrome
    </a>
    <a
      className="button"
      href="https://addons.mozilla.org/en-US/firefox/addon/postrchild/"
    >
      Firefox
    </a>
  </>
)

export default HomePage
