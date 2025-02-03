const createPersonTable = async (personName) => {
    const tableName = `person_${personName}`; // Table name based on person's name
  
    const PersonModel = sequelize.define(
      tableName,
      {
          AccountName: {
            type: DataTypes.STRING,
            allowNull: false,
          },
      
          AccountID: {
            type: DataTypes.INTEGER,
            primaryKey: true,
            autoIncrement: true,
          },
      
          ApiKey: {
            type: DataTypes.STRING,
            allowNull: false,
          },
      
          BusinessUnitID: {
            type: DataTypes.INTEGER,
            allowNull: false,
          },
      
          SupplierID: {
            type: DataTypes.INTEGER,
          },
          RateCard : DataTypes.INTEGER,
          Quality: {
            type: DataTypes.STRING,
            allowNull: false,
          },
          Complete: {
            type: DataTypes.STRING,
            allowNull: false,
          },
      
          Termination: {
            type: DataTypes.STRING,
            allowNull: false,
          },
          OverQuota: {
            type: DataTypes.STRING,
            allowNull: false,
          },
          SupplierName: {
            type: DataTypes.STRING,
            allowNull: false,
          },
          HashingKey: {
            type: DataTypes.STRING,
            allowNull: false,
          },
        },
        {
          timestamps: true,
          indexes: [
            {
              fields: ['ApiKey', 'SupplierID'],
            },
          ],
        }
    );
  
    await PersonModel.sync(); 
    console.log(`Table '${tableName}' created successfully.`);
  };
  