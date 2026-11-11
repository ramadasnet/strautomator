// Strautomator Core: Mailer templates

/**
 * The base template used on all sent emails.
 */
export const EmailBaseTemplate = "<div>${contents}</div><div>-<br><small>Email sent by ${appTitle}</small><br><a href='${appUrl}' title='Strautomator'>${appUrl}</a></div>"

/**
 * Email templates.
 */
export const EmailTemplates = {
    // Below are the list of email templates (subject and body).

    // When a recipe action fails to execute.
    RecipeFailedAction: {
        subject: "Failed automation: ${recipeTitle}",
        body:
            "<p>" +
            "Hello there!<br><br>" +
            "Just to let you know that one of your automations failed to execute properly, so you might want to double check its configuration." +
            "</p>" +
            "<p>" +
            "<strong>${recipeTitle}</strong><br>" +
            "Action: ${action}<br>" +
            "Message: ${errorMessage}<br>" +
            "Activity: ID ${activityId}, on ${activityDate}" +
            "</p>" +
            "<p>" +
            "Please <a href='${appUrl}automations/edit?id=${recipeId}'>click here</a> to check the automation details on Strautomator." +
            "</p>"
    },

    // Pre alert reminder sent to user when gear components have reached a certain % of the target usage.
    GearWearPreAlert: {
        subject: "${gearName} - ${count} (GearWear)",
        body:
            "<p>" +
            "This is a friendly reminder that the components below have now reached their pre-alert threshold.<br>-<br>" +
            "${components}" +
            "</p>" +
            "<p>" +
            "This is a good time to double check if everything is in order with these components." +
            "</p>"
    },

    // Alert sent to user when gear components have passed the defined distance.
    GearWearAlert: {
        subject: "${gearName} - ${count} (GearWear)",
        body:
            "<p>" +
            "It's about time to replace the components below!<br>-<br>" +
            "${components}" +
            "</p>" +
            "<p>" +
            "You should reset the tracking once you have replaced a component. You can also edit a component and increase the alert threshold, if needed." +
            "</p>"
    },

    // Reminder sent if user hasn't reset the distance on gear components after they reach 120% of the distance threshold.
    GearWearReminder: {
        subject: "${gearName} - ${count} (GearWear)",
        body: "<p>" + "This is a friendly reminder that you haven't reset the usage for the components below.<br>-<br>" + "${components}" + "</p>"
    },

    // Reminder sent if GearWear components haven't been used or updated for a while.
    GearWearIdle: {
        subject: "${gearName} has idle components (GearWear)",
        body:
            "<p>" +
            "Your gear has some components that haven't been updated for a while. Perhaps a good time to double check if you still have and need them registered on Strautomator?<br>-<br>" +
            "<strong>${gearName} - idle components:</strong><br>" +
            "${components}" +
            "</p>" +
            "<p>" +
            'To edit the components, please <a href="${editLink}">click here</a> to go to the GearWear details on Strautomator.' +
            "</p>"
    },

    // Alert sent to user when devices are reported to have low battery.
    GearWearLowBattery: {
        subject: "Devices with low battery",
        body:
            "<p>" +
            "You have devices or sensors reported with low battery:" +
            "<br><br>" +
            "${devices}" +
            "</p>" +
            "<p>" +
            'If you need to buy replacement batteries or parts, check the <a href="${affiliateLink}">best deals in our affiliate stores</a>.' +
            "</p>"
    },

    // When a Strava refresh token has expired and user needs to reauthenticate.
    StravaTokenExpired: {
        subject: "Please reconnect to Strautomator",
        body:
            "<p>" +
            "Hi ${userName}!<br><br>" +
            "It looks like the connection between Strautomator and your Strava account has expired.<br>" +
            'If you wish to keep using Strautomator, please reauthenticate at <a href="${appUrl}auth/login">${appUrl}auth/login</a>' +
            "</p>"
    },

    // When a Spotify refresh token is about to expire and user needs to reauthenticate.
    SpotifyTokenExpiring: {
        subject: "Your Spotify auth will expire in ${days} days",
        body:
            "<p>" +
            "Hi ${userName}!<br><br>" +
            "Spotify requires users to reauthenticate their 3rd party integrations every few months, and the link between Strautomator and your Spotify account is set to expire on <strong>${expiryDate}</strong>.<br>" +
            "Once it expires, Strautomator won't be able to fetch the music you listened to during your activities, and your Spotify account will be automatically unlinked." +
            "</p>" +
            "<p>" +
            'To keep it working, please <a href="${appUrl}account?spotify=link">click here</a> to link your Spotify account again.' +
            "</p>"
    },

    // When user has many unread notifications.
    UnreadNotifications: {
        subject: "You have ${count} unread notifications",
        body:
            "<p>" +
            "Hi ${userName}!<br><br>" +
            "It might have been a while since you last checked your account on Strautomator... and there are some unread notifications for you:<br><br>-" +
            "${notifications}" +
            "</p>" +
            "<p>" +
            'Please go to <a href="${appUrl}account/notifications">My Notifications</a> for more details.' +
            "</p>"
    },

    // User was suspended.
    UserSuspended: {
        subject: "Your account was suspended",
        body:
            "<p>" +
            "Hi ${userName}!<br><br>" +
            "Your Strautomator account was automatically suspended due to repeated failures to fetch your Strava data." +
            "</p>" +
            "<p>" +
            'To reactivate your account, please login again at <a href="${appUrl}auth/login">${appUrl}auth/login</a>.' +
            "</p>"
    },

    // User must confirm the email address.
    ConfirmEmail: {
        subject: "Confirm your email address",
        body:
            "<p>" +
            "Hi ${userName}!<br><br>" +
            'To confirm your email address "${email}" on Strautomator, please <a href="${appUrl}account?email=${email}&token=${token}">click here</a>, ' +
            "or open the following link in your browser:<br><br>" +
            "${appUrl}account?email=${email}&token=${token}" +
            "</p>" +
            "<p>" +
            "<i>If you haven't registered an email with Strautomator, please ignore this email.</i>" +
            "</p>"
    }
}

/**
 * Tips appended to the component details on GearWear pre alert emails, indexed by component name.
 */
export const GearWearTips = {
    chain: "For instance, check the chain stretch and if all pins are rolling freely.",
    tires: "For instance, you might want to swap the front and rear tires to better distribute their wear.",
    cassette: "For instance, you might want to remove the cassette from the wheel to properly clean and inspect it."
}
