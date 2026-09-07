package com.medsign.app;

import android.app.Activity;
import android.graphics.Color;
import android.os.Bundle;
import android.view.Gravity;
import android.view.ViewGroup;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;

/**
 * Health Connect opens this screen from its permissions UI. Keep its wording aligned with the
 * privacy policy submitted in Play Console whenever product policy changes.
 */
public class HealthPermissionsRationaleActivity extends Activity {
    private static final int HORIZONTAL_PADDING_DP = 24;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        int padding = dp(HORIZONTAL_PADDING_DP);
        ScrollView scrollView = new ScrollView(this);
        LinearLayout content = new LinearLayout(this);
        content.setOrientation(LinearLayout.VERTICAL);
        content.setPadding(padding, dp(32), padding, dp(32));
        content.setGravity(Gravity.CENTER_HORIZONTAL);

        TextView title = text("Your health-data privacy", 26, true);
        content.addView(title, fullWidth());

        TextView body = text(
            "MedSign can read only the individual Health Connect data types you choose, such as "
                + "heart rate, sleep, blood pressure, oxygen saturation, temperature, weight, "
                + "and steps.\n\n"
                + "Reading happens only after you approve the Health Connect permission screen "
                + "and start a sync in MedSign. MedSign does not write to Health Connect, does not "
                + "request background access, and does not request access to your full history.\n\n"
                + "Before any selected readings leave your device, MedSign shows them for your "
                + "review. You can change or revoke access at any time in Health Connect.",
            16,
            false
        );
        body.setPadding(0, dp(20), 0, dp(24));
        content.addView(body, fullWidth());

        Button close = new Button(this);
        close.setText("Close");
        close.setAllCaps(false);
        close.setOnClickListener(view -> finish());
        content.addView(close, wrapWidth());

        scrollView.addView(content);
        setContentView(scrollView);
    }

    private TextView text(String value, int sizeSp, boolean bold) {
        TextView view = new TextView(this);
        view.setText(value);
        view.setTextSize(sizeSp);
        view.setTextColor(Color.rgb(15, 23, 42));
        view.setLineSpacing(0, 1.18f);
        if (bold) {
            view.setTypeface(view.getTypeface(), android.graphics.Typeface.BOLD);
        }
        return view;
    }

    private LinearLayout.LayoutParams fullWidth() {
        return new LinearLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT,
            ViewGroup.LayoutParams.WRAP_CONTENT
        );
    }

    private LinearLayout.LayoutParams wrapWidth() {
        return new LinearLayout.LayoutParams(
            ViewGroup.LayoutParams.WRAP_CONTENT,
            ViewGroup.LayoutParams.WRAP_CONTENT
        );
    }

    private int dp(int value) {
        return Math.round(value * getResources().getDisplayMetrics().density);
    }
}
