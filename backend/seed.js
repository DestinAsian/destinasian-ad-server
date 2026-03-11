const mongoose = require('mongoose');
require('dotenv').config();

const Campaign = require('./models/Campaign');
const AdUnit = require('./models/AdUnit');
const Impression = require('./models/Impression');
const Click = require('./models/Click');

const seedDatabase = async () => {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/ad-server');
    console.log('✓ Connected to MongoDB');

    // Clear existing data
    await Campaign.deleteMany({});
    await AdUnit.deleteMany({});
    await Impression.deleteMany({});
    await Click.deleteMany({});
    console.log('✓ Cleared existing data');

    // Create sample campaigns
    const campaign1 = new Campaign({
      name: 'Spring Sale 2024',
      description: 'Spring season promotion campaign',
      status: 'active',
      startDate: new Date('2024-03-01T08:00:00'),
      endDate: new Date('2024-05-31T18:00:00')
    });

    const campaign2 = new Campaign({
      name: 'Summer Collection Launch',
      description: 'New summer collection launch campaign',
      status: 'active',
      startDate: new Date('2024-06-01T09:00:00'),
      endDate: new Date('2024-08-31T20:00:00')
    });

    const campaign3 = new Campaign({
      name: 'Holiday Special',
      description: 'Holiday season special promotion',
      status: 'paused',
      startDate: new Date('2024-11-01T10:00:00'),
      endDate: new Date('2024-12-31T21:00:00')
    });

    await campaign1.save();
    await campaign2.save();
    await campaign3.save();
    console.log('✓ Created sample campaigns');

    // Create sample ad units
    const adUnit1 = new AdUnit({
      name: 'Banner Ad - Spring Sale',
      description: 'Main banner for spring sale',
      campaign: campaign1._id,
      startDate: new Date('2024-03-01T08:00:00'),
      endDate: new Date('2024-05-31T18:00:00'),
      adCode: 'ad-spring-banner-001',
      width: '100%',
      aspectRatio: '1:1',
      imageUrl: 'https://via.placeholder.com/200x200?text=Spring+Sale',
      clickUrl: 'https://example.com/spring-sale',
      status: 'active'
    });

    const adUnit2 = new AdUnit({
      name: 'Wide Banner - Spring Sale',
      description: 'Wide banner for spring sale',
      campaign: campaign1._id,
      startDate: new Date('2024-03-15T09:30:00'),
      endDate: new Date('2024-05-15T17:30:00'),
      adCode: 'ad-spring-wide-002',
      width: '100%',
      aspectRatio: '1:1',
      imageUrl: 'https://via.placeholder.com/600x600?text=Spring+Promotion',
      clickUrl: 'https://example.com/spring-sale',
      status: 'active'
    });

    const adUnit3 = new AdUnit({
      name: 'Summer Launch Ad',
      description: 'Summer collection launch ad',
      campaign: campaign2._id,
      startDate: new Date('2024-06-01T09:00:00'),
      endDate: new Date('2024-08-31T20:00:00'),
      adCode: 'ad-summer-launch-001',
      width: '100%',
      aspectRatio: '1:1',
      imageUrl: 'https://via.placeholder.com/200x200?text=Summer+Collection',
      clickUrl: 'https://example.com/summer-collection',
      status: 'active'
    });

    const adUnit4 = new AdUnit({
      name: 'Summer Flex Banner',
      description: 'Flexible width summer banner',
      campaign: campaign2._id,
      startDate: new Date('2024-06-15T10:00:00'),
      endDate: new Date('2024-08-15T19:00:00'),
      adCode: 'ad-summer-flex-002',
      width: '100%',
      aspectRatio: '1:1',
      imageUrl: 'https://via.placeholder.com/600x600?text=New+Summer+Arrivals',
      clickUrl: 'https://example.com/summer-collection',
      status: 'active'
    });

    const adUnit5 = new AdUnit({
      name: 'Holiday Special Ad',
      description: 'Holiday season special',
      campaign: campaign3._id,
      startDate: new Date('2024-11-01T10:00:00'),
      endDate: new Date('2024-12-31T21:00:00'),
      adCode: 'ad-holiday-special-001',
      width: '100%',
      aspectRatio: '1:1',
      imageUrl: 'https://via.placeholder.com/200x200?text=Holiday+Sale',
      clickUrl: 'https://example.com/holiday-sale',
      status: 'active'
    });

    await adUnit1.save();
    await adUnit2.save();
    await adUnit3.save();
    await adUnit4.save();
    await adUnit5.save();
    console.log('✓ Created sample ad units');

    // Update campaigns with ad units
    campaign1.adUnits = [adUnit1._id, adUnit2._id];
    campaign2.adUnits = [adUnit3._id, adUnit4._id];
    campaign3.adUnits = [adUnit5._id];

    await campaign1.save();
    await campaign2.save();
    await campaign3.save();
    console.log('✓ Updated campaigns with ad units');

    // Generate sample impressions and clicks
    const generateTrackingData = async (campaignId, adUnitId, impressionCount, clickCount) => {
      const impressions = [];
      const clicks = [];
      
      // Generate impressions
      for (let i = 0; i < impressionCount; i++) {
        const daysAgo = Math.floor(Math.random() * 30);
        const timestamp = new Date();
        timestamp.setDate(timestamp.getDate() - daysAgo);
        timestamp.setHours(Math.floor(Math.random() * 24));
        timestamp.setMinutes(Math.floor(Math.random() * 60));
        
        impressions.push({
          campaign: campaignId,
          adUnit: adUnitId,
          userIp: `192.168.${Math.floor(Math.random() * 256)}.${Math.floor(Math.random() * 256)}`,
          userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
          referrer: 'https://example.com',
          timestamp
        });
      }
      
      // Generate clicks (subset of impressions)
      for (let i = 0; i < clickCount; i++) {
        const daysAgo = Math.floor(Math.random() * 30);
        const timestamp = new Date();
        timestamp.setDate(timestamp.getDate() - daysAgo);
        timestamp.setHours(Math.floor(Math.random() * 24));
        timestamp.setMinutes(Math.floor(Math.random() * 60));
        
        clicks.push({
          campaign: campaignId,
          adUnit: adUnitId,
          userIp: `192.168.${Math.floor(Math.random() * 256)}.${Math.floor(Math.random() * 256)}`,
          userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
          referrer: 'https://example.com',
          timestamp
        });
      }
      
      await Impression.insertMany(impressions);
      await Click.insertMany(clicks);
    };

    // Generate tracking data for each ad unit
    await generateTrackingData(campaign1._id, adUnit1._id, 1250, 45);
    await generateTrackingData(campaign1._id, adUnit2._id, 3400, 128);
    await generateTrackingData(campaign2._id, adUnit3._id, 2100, 67);
    await generateTrackingData(campaign2._id, adUnit4._id, 4500, 234);
    await generateTrackingData(campaign3._id, adUnit5._id, 0, 0);
    console.log('✓ Generated sample impressions and clicks');

    // Calculate and update campaign totals
    const campaign1Impressions = 1250 + 3400;
    const campaign1Clicks = 45 + 128;
    const campaign2Impressions = 2100 + 4500;
    const campaign2Clicks = 67 + 234;
    const campaign3Impressions = 0;
    const campaign3Clicks = 0;

    campaign1.totalImpressions = campaign1Impressions;
    campaign1.totalClicks = campaign1Clicks;
    campaign2.totalImpressions = campaign2Impressions;
    campaign2.totalClicks = campaign2Clicks;
    campaign3.totalImpressions = campaign3Impressions;
    campaign3.totalClicks = campaign3Clicks;

    await campaign1.save();
    await campaign2.save();
    await campaign3.save();
    console.log('✓ Updated campaign totals');

    console.log('\n✅ Database seeding complete!\n');
    console.log('Sample Data Created:');
    console.log(`  • ${3} Campaigns`);
    console.log(`  • ${5} Ad Units`);
    console.log(`  • Total Impressions: ${campaign1Impressions + campaign2Impressions + campaign3Impressions}`);
    console.log(`  • Total Clicks: ${campaign1Clicks + campaign2Clicks + campaign3Clicks}`);
    const totalCtr = (campaign1Impressions + campaign2Impressions + campaign3Impressions) > 0 
      ? (((campaign1Clicks + campaign2Clicks + campaign3Clicks) / (campaign1Impressions + campaign2Impressions + campaign3Impressions)) * 100).toFixed(2)
      : 0;
    console.log(`  • Average CTR: ${totalCtr}%`);

    await mongoose.connection.close();
    console.log('\n✓ Database connection closed');
  } catch (error) {
    console.error('❌ Error seeding database:', error);
    process.exit(1);
  }
};

seedDatabase();
