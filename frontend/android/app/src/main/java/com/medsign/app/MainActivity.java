package com.medsign.app;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(android.os.Bundle savedInstanceState) {
        registerPlugin(HealthHubPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
