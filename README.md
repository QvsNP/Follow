# Twitter Follow Back and Unfollow non Followers

This Script Uses the twitter-api-v2 npm module Found here https://www.npmjs.com/package/twitter-api-v2

To run the Following.js Script Fill out the config file with the following keys and tokens from your twitter developer account. 
Also set Follow and Unfollow with the Proper attribute [True Or False]

```javascript
export default {
    bearer : <YourKeyHere>,
    appKey: <YourKeyHere>,
    appSecret: <YourKeyHere>,
    accessToken: <YourKeyHere>,
    accessSecret: <YourKeyHere>,
    // Your Twitter Username "QvsNP" for example [Don't add @]
    userName: "QvsNP",
    //Script will follow back people who follw you if this is set to true
    //Else set it to false if you don't want the script to follow back
    follow: true,
    //Script will unfollow people who don't follow you. If this is set to true
    //Else set it to false if you don't want the script to unfollow
    unfollow: true,
}
```

