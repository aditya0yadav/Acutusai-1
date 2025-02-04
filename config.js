const { Sequelize } = require('sequelize');

const sequelize = new Sequelize('acutusdb', 'acutusdbadmin', 'THJuOs3i9i2FA7z', {
  host: 'acutus-db.c9q6ec2iwrfk.ap-south-1.rds.amazonaws.com', 
  port: 3306,        
  dialect: 'mysql',
  pool: {
    max: 105,                  
    min: 0,                   
    acquire: 30000,           
    idle: 10000               
  },
  // logging: false,           
  benchmark: true,         
  define: {
    timestamps: true,    
  },
  poolLogging: true 
});

module.exports = sequelize;
