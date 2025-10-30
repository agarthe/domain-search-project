-- Content pages for footer links (How to Use, Company, Terms, Privacy)
CREATE TABLE IF NOT EXISTS content_pages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  page_key TEXT UNIQUE NOT NULL,  -- 'how_to_use', 'company', 'terms', 'privacy'
  title_en TEXT NOT NULL,
  title_ja TEXT NOT NULL,
  content_en TEXT,  -- HTML content
  content_ja TEXT,  -- HTML content
  is_active INTEGER DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Insert default content pages
INSERT INTO content_pages (page_key, title_en, title_ja, content_en, content_ja) VALUES
('how_to_use', 'How to Use', '使い方', 
'<h2>How to Use inu.name</h2>
<p>Welcome to inu.name - your fast and easy domain search tool!</p>
<h3>Getting Started</h3>
<ol>
<li>Enter a domain name or keyword in the search box</li>
<li>Results appear automatically as you type</li>
<li>Green badge means the domain is available</li>
<li>Red badge means the domain is taken</li>
</ol>
<h3>Features</h3>
<ul>
<li>Real-time domain availability checking</li>
<li>Multiple registrar options with pricing</li>
<li>WHOIS lookup for registered domains</li>
<li>Support for multiple TLDs (.com, .net, .org, .jp, etc.)</li>
</ul>',
'<h2>inu.nameの使い方</h2>
<p>inu.nameへようこそ - 高速で簡単なドメイン検索ツールです！</p>
<h3>始め方</h3>
<ol>
<li>検索ボックスにドメイン名またはキーワードを入力</li>
<li>入力すると自動的に結果が表示されます</li>
<li>緑色のバッジはドメインが取得可能です</li>
<li>赤色のバッジはドメインが取得済みです</li>
</ol>
<h3>機能</h3>
<ul>
<li>リアルタイムのドメイン可用性チェック</li>
<li>複数のレジストラと価格表示</li>
<li>登録済みドメインのWHOIS検索</li>
<li>複数のTLDに対応（.com、.net、.org、.jpなど）</li>
</ul>'),

('company', 'Company', '運営会社', 
'<h2>About Agarthe LLC</h2>
<p><strong>Company Name:</strong> Agarthe LLC</p>
<p><strong>Location:</strong> Tokyo, Japan</p>
<p><strong>Service:</strong> inu.name - Domain Search Tool</p>
<h3>Our Mission</h3>
<p>We provide fast and reliable domain search services to help you find the perfect domain name for your project.</p>
<h3>Contact</h3>
<p>Email: info@inu.name</p>',
'<h2>Agarthe LLCについて</h2>
<p><strong>会社名:</strong> Agarthe LLC</p>
<p><strong>所在地:</strong> 東京、日本</p>
<p><strong>サービス:</strong> inu.name - ドメイン検索ツール</p>
<h3>私たちのミッション</h3>
<p>プロジェクトに最適なドメイン名を見つけるための、高速で信頼性の高いドメイン検索サービスを提供します。</p>
<h3>お問い合わせ</h3>
<p>メール: info@inu.name</p>'),

('terms', 'Terms of Service', '利用規約', 
'<h2>Terms of Service</h2>
<p><strong>Last Updated:</strong> 2025-10-29</p>
<h3>1. Acceptance of Terms</h3>
<p>By using inu.name, you agree to these terms of service.</p>
<h3>2. Service Description</h3>
<p>inu.name provides domain name search and availability checking services. We use third-party APIs to provide this information.</p>
<h3>3. Disclaimer</h3>
<p>Domain availability information is provided "as is" without warranty. Actual availability should be verified with the domain registrar.</p>
<h3>4. Prohibited Use</h3>
<p>You may not use this service for:</p>
<ul>
<li>Automated scraping or bulk checking</li>
<li>Any illegal purposes</li>
<li>Overloading our servers</li>
</ul>
<h3>5. Changes to Terms</h3>
<p>We reserve the right to modify these terms at any time.</p>',
'<h2>利用規約</h2>
<p><strong>最終更新:</strong> 2025年10月29日</p>
<h3>1. 規約への同意</h3>
<p>inu.nameをご利用いただくことで、本利用規約に同意したものとみなされます。</p>
<h3>2. サービスの説明</h3>
<p>inu.nameは、ドメイン名検索および可用性チェックサービスを提供します。サードパーティAPIを使用してこの情報を提供しています。</p>
<h3>3. 免責事項</h3>
<p>ドメインの可用性情報は「現状のまま」保証なしで提供されます。実際の可用性はドメインレジストラで確認してください。</p>
<h3>4. 禁止事項</h3>
<p>以下の目的でこのサービスを使用することはできません：</p>
<ul>
<li>自動スクレイピングまたは一括チェック</li>
<li>違法な目的</li>
<li>サーバーへの過負荷</li>
</ul>
<h3>5. 規約の変更</h3>
<p>当社はいつでもこれらの規約を変更する権利を留保します。</p>'),

('privacy', 'Privacy Policy', 'プライバシーポリシー', 
'<h2>Privacy Policy</h2>
<p><strong>Last Updated:</strong> 2025-10-29</p>
<h3>1. Information We Collect</h3>
<p>When you use inu.name, we may collect:</p>
<ul>
<li>Search queries (domain names you search for)</li>
<li>IP address</li>
<li>Browser information (user agent)</li>
<li>Language preferences</li>
</ul>
<h3>2. How We Use Information</h3>
<p>We use collected information to:</p>
<ul>
<li>Provide domain search services</li>
<li>Improve our service quality</li>
<li>Generate usage statistics</li>
</ul>
<h3>3. Data Storage</h3>
<p>Your search history is stored in our database for service improvement purposes. We do not share this data with third parties.</p>
<h3>4. Cookies</h3>
<p>We use localStorage to save your preferences (theme, language, currency).</p>
<h3>5. Third-Party Services</h3>
<p>We use third-party APIs (Domainr, WHOIS providers) to provide our services. Please refer to their privacy policies.</p>
<h3>6. Your Rights</h3>
<p>You have the right to request deletion of your search history. Contact us at info@inu.name</p>',
'<h2>プライバシーポリシー</h2>
<p><strong>最終更新:</strong> 2025年10月29日</p>
<h3>1. 収集する情報</h3>
<p>inu.nameをご利用いただく際、以下の情報を収集する場合があります：</p>
<ul>
<li>検索クエリ（検索したドメイン名）</li>
<li>IPアドレス</li>
<li>ブラウザ情報（ユーザーエージェント）</li>
<li>言語設定</li>
</ul>
<h3>2. 情報の使用方法</h3>
<p>収集した情報は以下の目的で使用します：</p>
<ul>
<li>ドメイン検索サービスの提供</li>
<li>サービス品質の向上</li>
<li>利用統計の生成</li>
</ul>
<h3>3. データの保存</h3>
<p>検索履歴はサービス改善のためにデータベースに保存されます。このデータを第三者と共有することはありません。</p>
<h3>4. Cookie</h3>
<p>お客様の設定（テーマ、言語、通貨）を保存するためにlocalStorageを使用します。</p>
<h3>5. 第三者サービス</h3>
<p>サービス提供のために第三者API（Domainr、WHOISプロバイダー）を使用しています。それらのプライバシーポリシーを参照してください。</p>
<h3>6. お客様の権利</h3>
<p>検索履歴の削除を要求する権利があります。info@inu.nameまでお問い合わせください。</p>');

CREATE INDEX IF NOT EXISTS idx_content_pages_key ON content_pages(page_key);
