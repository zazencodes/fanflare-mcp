# Use Fanflare in ChatGPT

Fanflare looks up a book and returns sourced details up to the passage you are reading. You can search, check which chapters have coverage, and ask about a scene without a Fanflare account.

## Connect your own ChatGPT

1. Open [Plugins in ChatGPT](https://chatgpt.com/plugins) **on the web**, using the account and workspace you use on your phone. Select **+ → Add custom MCP server**.
2. Name it **Fanflare**. Enter `https://fanflare.art/mcp` as the public HTTPS address. Choose **No authentication** for your first reading session. Review the warning, select **Create as a plugin**, review the discovered tools, and install it.
3. Start a chat on the web and select **@Fanflare**. Try the example below. Look for the Fanflare tool call and the source in the answer.
4. Open the ChatGPT app on your phone in the same workspace. Look under **Plugins → Installed**, then select **@Fanflare** in a new chat and repeat the example.

> @Fanflare I’m reading chapter one of Alice’s Adventures in Wonderland. I’m at “White Rabbit with pink eyes ran close by her.” What can I use in an illustration up to this sentence? Please cite the passage.

Fanflare should identify the White Rabbit’s pink eyes and cite chapter I, paragraph 2. The watch appears later and should stay out of this answer. If the passage is ambiguous, expect a question about your edition or reading position.

**Availability checked November 17, 2026.** OpenAI documents custom server setup on the web, read tools for Pro, and workspace-controlled access for Business, Enterprise and Edu. If **Add custom MCP server** is missing, check your plan, workspace and permissions. The mobile directory supports plugins, but individual capabilities vary. If the web test works and Fanflare is missing on your phone, record your phone OS, ChatGPT app version and workspace. Personal mobile use and generated-image transfer still need a real device test. [Custom MCP connections](https://help.openai.com/en/articles/12584461-connecting-custom-mcp-servers-in-chatgpt) · [Plugins on mobile](https://help.openai.com/en/articles/20001256-plugins-in-chatgpt)

## When you want to contribute

Anonymous access covers book search, scene context and index status. To request indexing, report or contribute a detail, or share artwork, use an OAuth-enabled connection and grant the requested Fanflare permission. If you set up your connection with **No authentication**, configure an OAuth connection for these actions. Artwork goes into a private draft. Open its review link and approve the exact image and credit before publishing.

## Other MCP clients

Use the same HTTPS address with a client that supports Streamable HTTP. For a server running on your own machine, a local client can use `http://127.0.0.1:8787/mcp`. Use the hosted HTTPS address when connecting ChatGPT. The source and local quickstart are in the [Fanflare MCP repository](https://github.com/zazencodes/fanflare-mcp).
