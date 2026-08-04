-- Set admin@quizzly.app as super admin (owner role)
update profiles
set role = 'owner'
where email = 'admin@quizzly.app';
